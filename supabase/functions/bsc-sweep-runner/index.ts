// Sweeps USDT/USDC from per-user BEP20 deposit addresses to the main treasury.
// Two-step flow per address:
//   1) Gas station (BNB-funded EOA) sends a small BNB drip to the derived address.
//   2) Derived address signs an ERC20 transfer() to the treasury.
// Each step is tracked in `bsc_sweep_jobs` with state machine:
//   queued -> gas_funded -> swept -> confirmed (or failed after retries)
//
// Callable two ways:
//   - cron (x-cron-secret header)  -> full discover + advance + finalize cycle
//   - admin trigger (Bearer token + admin role) -> same body, just no cron header
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mnemonicToAccount, privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { bscRpc, getBscRpcUrls } from "../_shared/bscRpc.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BSC_CHAIN_ID = 56;
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { symbol: "USDC", decimals: 18 },
};
const TOKEN_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOKENS).map(([addr, t]) => [t.symbol, addr]),
);
const ERC20_TRANSFER_GAS = 65000n;        // safe upper bound for stablecoin transfer
const GAS_BUFFER_MULT = 13n;              // 1.3x
const GAS_BUFFER_DIV = 10n;
const MIN_SWEEP_USD_DEFAULT = 5;
const MAX_DISCOVER_ADDRS = 200;           // per tick — cap balanceOf calls
const MAX_JOBS_PER_TICK = 50;
const MAX_ATTEMPTS = 5;
const CONFIRMATIONS_NEEDED = 3;
const RECON_WINDOW_DAYS = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toHex(n: bigint | number): string {
  return "0x" + BigInt(n).toString(16);
}
function pad32(hex: string): string {
  const h = hex.toLowerCase().replace(/^0x/, "");
  return h.padStart(64, "0");
}

function encodeBalanceOf(owner: string): string {
  return "0x70a08231" + pad32(owner);
}
function encodeTransfer(to: string, amount: bigint): string {
  return "0xa9059cbb" + pad32(to) + pad32(amount.toString(16));
}

async function callContract(to: string, data: string, admin: any): Promise<string> {
  return await bscRpc("eth_call", [{ to, data }, "latest"], { admin, alertSource: "bsc-sweep-runner" }) as string;
}

async function getGasPrice(admin: any): Promise<bigint> {
  const hex = await bscRpc("eth_gasPrice", [], { admin, alertSource: "bsc-sweep-runner" }) as string;
  // BSC mainnet floor is 1 gwei; add tiny buffer for inclusion.
  let g = BigInt(hex);
  const floor = 1_000_000_000n; // 1 gwei
  if (g < floor) g = floor;
  return g;
}

async function getBnbBalance(addr: string, admin: any): Promise<bigint> {
  const hex = await bscRpc("eth_getBalance", [addr, "latest"], { admin, alertSource: "bsc-sweep-runner" }) as string;
  return BigInt(hex);
}

async function getTokenBalance(token: string, owner: string, admin: any): Promise<bigint> {
  const hex = await callContract(token, encodeBalanceOf(owner), admin);
  return BigInt(hex || "0x0");
}

async function getNonce(addr: string, admin: any): Promise<number> {
  const hex = await bscRpc("eth_getTransactionCount", [addr, "pending"], { admin, alertSource: "bsc-sweep-runner" }) as string;
  return Number(BigInt(hex));
}

async function sendRaw(rawHex: string, admin: any): Promise<string> {
  return await bscRpc("eth_sendRawTransaction", [rawHex], { admin, alertSource: "bsc-sweep-runner" }) as string;
}

async function getReceipt(hash: string, admin: any): Promise<any> {
  return await bscRpc("eth_getTransactionReceipt", [hash], { admin, alertSource: "bsc-sweep-runner" });
}

async function blockNumber(admin: any): Promise<number> {
  const hex = await bscRpc("eth_blockNumber", [], { admin, alertSource: "bsc-sweep-runner" }) as string;
  return Number(BigInt(hex));
}

async function loadMinSweepUsd(admin: any): Promise<number> {
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", "bsc_min_sweep_usd").maybeSingle();
    const v = Number(data?.value);
    if (Number.isFinite(v) && v > 0) return v;
  } catch (_) { /* ignore */ }
  return MIN_SWEEP_USD_DEFAULT;
}

function weiToUsd(wei: bigint, decimals = 18): number {
  const whole = wei / 10n ** BigInt(decimals);
  const frac = wei % 10n ** BigInt(decimals);
  const fracStr = (frac / 10n ** BigInt(decimals - 6)).toString().padStart(6, "0");
  return Number(`${whole}.${fracStr}`);
}

function backoffSeconds(attempts: number): number {
  // 1m, 5m, 15m, 30m, 60m
  return [60, 300, 900, 1800, 3600][Math.min(attempts, 4)];
}

async function failJob(admin: any, jobId: string, attempts: number, err: string) {
  const next = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
  const status = attempts + 1 >= MAX_ATTEMPTS ? "failed" : undefined;
  await admin.from("bsc_sweep_jobs").update({
    attempts: attempts + 1,
    last_error: err.slice(0, 500),
    next_attempt_at: next,
    ...(status ? { status } : {}),
  }).eq("id", jobId);

  if (status === "failed") {
    try {
      await admin.rpc("record_system_alert", {
        _severity: "warning",
        _source: "bsc-sweep-runner",
        _code: "sweep_job_failed",
        _message: `Sweep job ${jobId} exhausted retries: ${err.slice(0, 200)}`,
        _details: { job_id: jobId, error: err },
        _dedupe_minutes: 30,
      });
    } catch (_) { /* swallow */ }
  }
}

async function discoverCandidates(admin: any, treasury: string, minUsd: number) {
  // Scope to addresses that had a credited event in the last N days (most likely to hold funds)
  // OR have an active job (we still need to advance/finish those).
  const since = new Date(Date.now() - RECON_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: recentCredited } = await admin
    .from("bsc_deposit_events")
    .select("address, user_id, token, token_contract")
    .eq("status", "credited")
    .gte("credited_at", since)
    .limit(MAX_DISCOVER_ADDRS);

  if (!recentCredited?.length) return 0;

  // Dedupe (address, token)
  const seen = new Set<string>();
  const candidates: { address: string; user_id: string; token: string; token_contract: string }[] = [];
  for (const r of recentCredited) {
    const key = `${(r.address as string).toLowerCase()}::${r.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(r as any);
  }

  // Need hd_index for each address
  const addrs = Array.from(new Set(candidates.map((c) => c.address.toLowerCase())));
  const { data: addrRows } = await admin
    .from("bsc_deposit_addresses")
    .select("address, hd_index, user_id")
    .in("address", addrs);
  const hdMap = new Map<string, { hd_index: number; user_id: string }>();
  for (const a of addrRows || []) {
    hdMap.set((a.address as string).toLowerCase(), { hd_index: a.hd_index, user_id: a.user_id });
  }

  let queued = 0;
  for (const c of candidates) {
    const meta = hdMap.get(c.address.toLowerCase());
    if (!meta) continue;
    const tokenAddr = (c.token_contract || TOKEN_BY_SYMBOL[c.token] || "").toLowerCase();
    if (!tokenAddr) continue;

    // Check live balance — if dust, skip
    let bal: bigint;
    try {
      bal = await getTokenBalance(tokenAddr, c.address.toLowerCase(), admin);
    } catch (_) { continue; }
    const usd = weiToUsd(bal);
    if (usd < minUsd) continue;

    // Skip if there's already an active (not-failed/not-confirmed) job for this (address, token).
    const { data: existing } = await admin
      .from("bsc_sweep_jobs")
      .select("id")
      .eq("address", c.address.toLowerCase())
      .eq("token", c.token)
      .in("status", ["queued", "gas_funded", "swept"])
      .maybeSingle();
    if (existing) continue;

    const { error: insErr } = await admin.from("bsc_sweep_jobs").insert({
      user_id: meta.user_id,
      address: c.address.toLowerCase(),
      hd_index: meta.hd_index,
      token: c.token,
      token_contract: tokenAddr,
      amount_wei: bal.toString(),
      amount_usd: usd,
      treasury_address: treasury.toLowerCase(),
      status: "queued",
    });
    if (!insErr) queued++;
  }
  return queued;
}

async function runQueuedJobs(admin: any, gasStation: any, seed: string, treasury: string) {
  const now = new Date().toISOString();
  const { data: jobs } = await admin
    .from("bsc_sweep_jobs")
    .select("*")
    .in("status", ["queued", "gas_funded", "swept"])
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(MAX_JOBS_PER_TICK);

  if (!jobs?.length) return { processed: 0 };

  let gasStationNonce = await getNonce(gasStation.address, admin);
  const gasPrice = await getGasPrice(admin);
  // Cost of one ERC20 transfer in BNB wei (with buffer)
  const sweepGasCostWei = (ERC20_TRANSFER_GAS * gasPrice * GAS_BUFFER_MULT) / GAS_BUFFER_DIV;

  let processed = 0;

  for (const job of jobs) {
    try {
      if (job.status === "queued") {
        // STEP 1: send BNB drip to derived address (skip if already funded)
        const have = await getBnbBalance(job.address, admin);
        if (have >= sweepGasCostWei) {
          // already funded — short-circuit
          await admin.from("bsc_sweep_jobs").update({
            status: "gas_funded",
            gas_funded_at: new Date().toISOString(),
            last_error: null,
          }).eq("id", job.id);
        } else {
          const need = sweepGasCostWei - have;
          const rawTx = await gasStation.signTransaction({
            chainId: BSC_CHAIN_ID,
            to: job.address as `0x${string}`,
            value: need,
            gas: 21000n,
            gasPrice,
            nonce: gasStationNonce,
            type: "legacy",
          });
          gasStationNonce += 1;
          const txHash = await sendRaw(rawTx, admin);
          await admin.from("bsc_sweep_jobs").update({
            status: "gas_funded",
            gas_tx_hash: txHash,
            gas_funded_at: new Date().toISOString(),
            last_error: null,
          }).eq("id", job.id);
        }
        processed++;
        continue;
      }

      if (job.status === "gas_funded") {
        // STEP 2: confirm gas tx (if any) then broadcast transfer
        if (job.gas_tx_hash) {
          const rcpt = await getReceipt(job.gas_tx_hash, admin);
          if (!rcpt) {
            // not yet mined — try again later
            await admin.from("bsc_sweep_jobs").update({
              next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
            }).eq("id", job.id);
            continue;
          }
          if (rcpt.status !== "0x1") {
            await failJob(admin, job.id, job.attempts, `gas tx failed: ${job.gas_tx_hash}`);
            continue;
          }
        }

        // Re-check token balance — credit may have changed
        const bal = await getTokenBalance(job.token_contract, job.address, admin);
        if (bal === 0n) {
          // Nothing to sweep — mark confirmed (already empty)
          await admin.from("bsc_sweep_jobs").update({
            status: "confirmed",
            amount_wei: "0",
            amount_usd: 0,
            confirmed_at: new Date().toISOString(),
            last_error: null,
          }).eq("id", job.id);
          processed++;
          continue;
        }

        // Derive the derived-address signer from the seed + hd_index
        const userAcct = mnemonicToAccount(seed, { addressIndex: job.hd_index });
        const nonce = await getNonce(job.address, admin);
        const rawTx = await userAcct.signTransaction({
          chainId: BSC_CHAIN_ID,
          to: job.token_contract as `0x${string}`,
          data: encodeTransfer(treasury, bal) as `0x${string}`,
          value: 0n,
          gas: ERC20_TRANSFER_GAS,
          gasPrice,
          nonce,
          type: "legacy",
        });
        const sweepHash = await sendRaw(rawTx, admin);
        await admin.from("bsc_sweep_jobs").update({
          status: "swept",
          sweep_tx_hash: sweepHash,
          amount_wei: bal.toString(),
          amount_usd: weiToUsd(bal),
          swept_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", job.id);
        processed++;
        continue;
      }

      if (job.status === "swept") {
        if (!job.sweep_tx_hash) {
          await failJob(admin, job.id, job.attempts, "swept without sweep_tx_hash");
          continue;
        }
        const rcpt = await getReceipt(job.sweep_tx_hash, admin);
        if (!rcpt) {
          await admin.from("bsc_sweep_jobs").update({
            next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
          }).eq("id", job.id);
          continue;
        }
        if (rcpt.status !== "0x1") {
          await failJob(admin, job.id, job.attempts, `sweep tx failed: ${job.sweep_tx_hash}`);
          continue;
        }
        const head = await blockNumber(admin);
        const confs = head - Number(BigInt(rcpt.blockNumber));
        if (confs < CONFIRMATIONS_NEEDED) {
          await admin.from("bsc_sweep_jobs").update({
            next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
          }).eq("id", job.id);
          continue;
        }
        await admin.from("bsc_sweep_jobs").update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", job.id);
        processed++;
        continue;
      }
    } catch (e) {
      console.error("sweep job error", job.id, (e as Error).message);
      await failJob(admin, job.id, job.attempts, (e as Error).message);
    }
  }

  return { processed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const seed = Deno.env.get("BSC_DEPOSIT_MASTER_SEED");
    const treasury = (Deno.env.get("BSC_TREASURY_ADDRESS") || "").toLowerCase();
    const gasPk = Deno.env.get("BSC_GAS_STATION_PRIVATE_KEY");
    if (!seed) return json({ error: "BSC_DEPOSIT_MASTER_SEED not configured" }, 500);
    if (!treasury) return json({ error: "BSC_TREASURY_ADDRESS not configured" }, 500);
    if (!gasPk) return json({ error: "BSC_GAS_STATION_PRIVATE_KEY not configured" }, 500);
    try { getBscRpcUrls(); } catch { return json({ error: "BSC_RPC_URL not configured" }, 500); }

    // CRITICAL SAFETY GUARD: refuse to run if the treasury address is itself a
    // known user deposit address. This prevents the catastrophic feedback loop
    // where a misconfigured BSC_TREASURY_ADDRESS == a deposit address causes
    // every sweep to credit the user again (sweep → poller detects inbound →
    // credit → sweep → …).
    {
      const adminCheck = createClient(SUPABASE_URL, SR);
      const { data: collision } = await adminCheck
        .from("bsc_deposit_addresses")
        .select("user_id")
        .eq("address", treasury)
        .maybeSingle();
      if (collision) {
        try {
          await adminCheck.rpc("record_system_alert", {
            _severity: "critical",
            _source: "bsc-sweep-runner",
            _code: "treasury_address_collision",
            _message: `BSC_TREASURY_ADDRESS (${treasury}) is registered as a user deposit address — sweep halted. Update the secret to the real treasury wallet.`,
            _details: { treasury, colliding_user_id: collision.user_id },
            _dedupe_minutes: 60,
          });
        } catch (_) { /* swallow */ }
        return json({
          error: "BSC_TREASURY_ADDRESS collides with a user deposit address — refusing to sweep. Update the secret.",
          treasury,
        }, 500);
      }
    }


    // Auth: cron secret OR admin Bearer token
    const cronHeader = req.headers.get("x-cron-secret");
    const expectedCron = Deno.env.get("CRON_SECRET");
    const isCron = !!cronHeader && !!expectedCron && cronHeader === expectedCron;

    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const tmpAdmin = createClient(SUPABASE_URL, SR);
      const { data: roles } = await tmpAdmin.from("user_roles").select("role").eq("user_id", userData.user.id);
      const roleSet = new Set((roles || []).map((r: any) => r.role));
      if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const admin = createClient(SUPABASE_URL, SR);
    const gasStation = privateKeyToAccount(
      (gasPk.startsWith("0x") ? gasPk : "0x" + gasPk) as `0x${string}`,
    );

    // Low-balance alert on gas station
    try {
      const gasBal = await getBnbBalance(gasStation.address, admin);
      if (gasBal < 50_000_000_000_000_000n) { // < 0.05 BNB
        await admin.rpc("record_system_alert", {
          _severity: "warning",
          _source: "bsc-sweep-runner",
          _code: "gas_station_low",
          _message: `BSC gas station balance is low: ${(Number(gasBal) / 1e18).toFixed(4)} BNB`,
          _details: { address: gasStation.address, balance_wei: gasBal.toString() },
          _dedupe_minutes: 60,
        });
      }
    } catch (_) { /* non-fatal */ }

    const minUsd = await loadMinSweepUsd(admin);
    const discovered = await discoverCandidates(admin, treasury, minUsd);
    const { processed } = await runQueuedJobs(admin, gasStation, seed, treasury);

    return json({ ok: true, discovered, processed, gas_station: gasStation.address, treasury });
  } catch (e) {
    console.error("bsc-sweep-runner error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
