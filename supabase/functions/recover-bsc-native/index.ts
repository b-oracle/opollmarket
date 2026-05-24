// Recover BNB (native) accidentally sent to a per-user BEP20 deposit address.
// The poller only watches ERC-20 Transfer logs, so native-BNB deposits are
// invisible. This function lets a super_admin verify the on-chain tx and either:
//   1) credit_and_sweep: convert BNB->USD, credit the user's balance, sweep
//      the BNB from the derived address to the treasury.
//   2) refund: send the BNB back to the original sender (minus gas).
//
// Auth: Bearer token + super_admin role only. All actions are audit-logged.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mnemonicToAccount } from "https://esm.sh/viem@2.21.0/accounts";
import { bscRpc } from "../_shared/bscRpc.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BSC_CHAIN_ID = 56;
const BNB_TRANSFER_GAS = 21_000n;
const GAS_BUFFER_MULT = 12n;
const GAS_BUFFER_DIV = 10n;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function weiToBnb(wei: bigint): number {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fracStr = (frac / 10n ** 12n).toString().padStart(6, "0");
  return Number(`${whole}.${fracStr}`);
}

async function getBnbPriceUsd(): Promise<number> {
  // Binance spot price — same provider used elsewhere on the platform.
  const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT", {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`BNB price fetch failed: ${r.status}`);
  const j = await r.json();
  const p = Number(j?.price);
  if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid BNB price");
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const seed = Deno.env.get("BSC_DEPOSIT_MASTER_SEED");
    const treasury = (Deno.env.get("BSC_TREASURY_ADDRESS") || "").toLowerCase();
    if (!seed) return json({ error: "BSC_DEPOSIT_MASTER_SEED not configured" }, 500);
    if (!treasury) return json({ error: "BSC_TREASURY_ADDRESS not configured" }, 500);

    // Auth — super_admin only
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SR);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    if (!roleSet.has("super_admin")) {
      return json({ error: "Forbidden — super_admin only" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const txHash = String(body.tx_hash || "").trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) return json({ error: "Invalid tx_hash" }, 400);

    // 1) Fetch tx + receipt
    const [tx, rcpt] = await Promise.all([
      bscRpc("eth_getTransactionByHash", [txHash], { admin, alertSource: "recover-bsc-native" }) as Promise<any>,
      bscRpc("eth_getTransactionReceipt", [txHash], { admin, alertSource: "recover-bsc-native" }) as Promise<any>,
    ]);
    if (!tx) return json({ error: "Transaction not found on-chain" }, 404);
    if (!rcpt) return json({ error: "Transaction not yet mined" }, 409);
    if (rcpt.status !== "0x1") return json({ error: "Transaction failed on-chain" }, 400);
    if (!tx.to) return json({ error: "Contract-creation tx; not a native transfer" }, 400);

    const toAddr = String(tx.to).toLowerCase();
    const fromAddr = String(tx.from).toLowerCase();
    const valueWei = BigInt(tx.value || "0x0");
    if (valueWei === 0n) return json({ error: "Tx has zero BNB value (not a native transfer)" }, 400);

    // 2) Confirm target is a known per-user deposit address
    const { data: addrRow } = await admin
      .from("bsc_deposit_addresses")
      .select("user_id, hd_index, address")
      .eq("address", toAddr)
      .maybeSingle();
    if (!addrRow) {
      return json({ error: "Recipient is not a known user deposit address" }, 404);
    }

    // 3) Idempotency — has this tx already been recovered?
    const { data: existing } = await admin
      .from("audit_logs")
      .select("id, action")
      .eq("target_type", "bsc_native_recovery")
      .eq("target_id", txHash)
      .maybeSingle();
    if (existing) {
      return json({ error: `This tx was already processed (${existing.action})` }, 409);
    }

    const bnbAmount = weiToBnb(valueWei);

    // PREVIEW
    if (action === "preview") {
      let priceUsd: number | null = null;
      try { priceUsd = await getBnbPriceUsd(); } catch (_) { priceUsd = null; }
      return json({
        ok: true,
        tx_hash: txHash,
        from: fromAddr,
        to: toAddr,
        user_id: addrRow.user_id,
        hd_index: addrRow.hd_index,
        bnb_amount: bnbAmount,
        bnb_price_usd: priceUsd,
        usd_value: priceUsd ? Number((bnbAmount * priceUsd).toFixed(2)) : null,
        block_number: Number(BigInt(rcpt.blockNumber)),
      });
    }

    if (action !== "credit_and_sweep" && action !== "refund") {
      return json({ error: "Invalid action. Use 'preview', 'credit_and_sweep' or 'refund'" }, 400);
    }

    // Derive user's account from seed + hd_index for on-chain moves
    const userAcct = mnemonicToAccount(seed, { addressIndex: addrRow.hd_index });
    if (userAcct.address.toLowerCase() !== toAddr) {
      return json({ error: "Derived address mismatch — refusing to act" }, 500);
    }

    // Current on-chain balance (may differ from tx value if multiple deposits stacked)
    const balHex = await bscRpc("eth_getBalance", [toAddr, "latest"], {
      admin, alertSource: "recover-bsc-native",
    }) as string;
    const balanceWei = BigInt(balHex);
    if (balanceWei === 0n) {
      return json({ error: "Deposit address holds no BNB — already swept or refunded" }, 409);
    }

    const gasPriceHex = await bscRpc("eth_gasPrice", [], {
      admin, alertSource: "recover-bsc-native",
    }) as string;
    let gasPrice = BigInt(gasPriceHex);
    const floor = 1_000_000_000n;
    if (gasPrice < floor) gasPrice = floor;
    const gasCost = (BNB_TRANSFER_GAS * gasPrice * GAS_BUFFER_MULT) / GAS_BUFFER_DIV;

    if (balanceWei <= gasCost) {
      return json({
        error: "BNB balance is less than required gas cost",
        balance_wei: balanceWei.toString(),
        gas_cost_wei: gasCost.toString(),
      }, 400);
    }

    const sendValue = balanceWei - gasCost;
    const recipient = action === "credit_and_sweep" ? treasury : fromAddr;

    const nonceHex = await bscRpc("eth_getTransactionCount", [toAddr, "pending"], {
      admin, alertSource: "recover-bsc-native",
    }) as string;
    const nonce = Number(BigInt(nonceHex));

    const rawTx = await userAcct.signTransaction({
      chainId: BSC_CHAIN_ID,
      to: recipient as `0x${string}`,
      value: sendValue,
      gas: BNB_TRANSFER_GAS,
      gasPrice,
      nonce,
      type: "legacy",
    });

    const sentHash = await bscRpc("eth_sendRawTransaction", [rawTx], {
      admin, alertSource: "recover-bsc-native",
    }) as string;

    let creditedUsd = 0;
    let bnbPriceUsd: number | null = null;

    if (action === "credit_and_sweep") {
      bnbPriceUsd = await getBnbPriceUsd();
      // Credit the user's main balance based on the ACTUAL tx amount (not balance).
      // This avoids over-crediting if multiple unrelated BNB deposits stacked
      // at the same address — the admin must process each tx separately.
      creditedUsd = Number((bnbAmount * bnbPriceUsd).toFixed(2));

      const { error: balErr } = await admin.rpc("adjust_balance", {
        _user_id: addrRow.user_id,
        _delta: creditedUsd,
        _bonus_delta: 0,
        _insurance_delta: 0,
      });
      if (balErr) {
        // CRITICAL: BNB already sent but credit failed — audit immediately so
        // an operator can reconcile manually.
        await admin.from("audit_logs").insert({
          actor_id: userData.user.id,
          action: "bsc_native_credit_failed",
          target_type: "bsc_native_recovery",
          target_id: txHash,
          details: {
            tx_hash: txHash, user_id: addrRow.user_id, sent_to_treasury: sentHash,
            intended_credit_usd: creditedUsd, error: balErr.message,
          },
        });
        return json({
          error: "BNB swept to treasury but balance credit failed — see audit log",
          sweep_tx: sentHash,
        }, 500);
      }

      await admin.from("transactions").insert({
        user_id: addrRow.user_id,
        type: "deposit",
        amount: creditedUsd,
        status: "confirmed",
        gross_amount_usd: creditedUsd,
        net_amount_usd: creditedUsd,
        description: `BNB recovery (manual). Original tx: ${txHash}. BNB amount: ${bnbAmount} @ $${bnbPriceUsd}. Sweep tx: ${sentHash}`,
      });

      await admin.from("notifications").insert({
        user_id: addrRow.user_id,
        title: "BNB Deposit Recovered ✅",
        message: `We recovered ${bnbAmount} BNB you sent to your USDT/USDC deposit address and credited $${creditedUsd.toFixed(2)} to your balance.`,
        type: "deposit",
      });
    } else {
      // Refund — no balance change, just notify the user
      await admin.from("notifications").insert({
        user_id: addrRow.user_id,
        title: "BNB Deposit Refunded ↩️",
        message: `${weiToBnb(sendValue)} BNB was returned to the sending address. Tx: ${sentHash.slice(0, 14)}…`,
        type: "deposit",
      });
    }

    await admin.from("audit_logs").insert({
      actor_id: userData.user.id,
      action: action === "credit_and_sweep" ? "bsc_native_credit_and_sweep" : "bsc_native_refund",
      target_type: "bsc_native_recovery",
      target_id: txHash,
      details: {
        tx_hash: txHash,
        user_id: addrRow.user_id,
        deposit_address: toAddr,
        original_sender: fromAddr,
        bnb_amount: bnbAmount,
        bnb_price_usd: bnbPriceUsd,
        credited_usd: creditedUsd,
        recovery_tx: sentHash,
        recovery_destination: recipient,
        gas_cost_wei: gasCost.toString(),
      },
    });

    return json({
      ok: true,
      action,
      recovery_tx: sentHash,
      recipient,
      bnb_sent: weiToBnb(sendValue),
      credited_usd: creditedUsd || undefined,
      bnb_price_usd: bnbPriceUsd ?? undefined,
    });
  } catch (e) {
    console.error("recover-bsc-native error:", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});
