// Polls BSC USDT/USDC Transfer logs, tracks confirmations, credits deposits.
// Cron-only: requires x-cron-secret header.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyCronSecret } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// BSC mainnet stablecoins (18 decimals each)
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { symbol: "USDC", decimals: 18 },
};
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const CONFIRMATIONS_REQUIRED = 12;
const MAX_BLOCKS_PER_RUN = 100;   // cap per cron tick
const CHUNK_BLOCKS = 5;           // strict — many free BSC RPCs limit to 5 blocks
const MIN_USD = 1;                // ignore dust

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method} rpc error: ${JSON.stringify(j.error)}`);
  return j.result;
}

function hexToBigInt(h: string): bigint { return BigInt(h); }
function topicToAddress(t: string): string { return ("0x" + t.slice(-40)).toLowerCase(); }
function wei18ToUsd(weiStr: string): number {
  // For 18-decimal stablecoins we treat 1 token = $1
  const wei = BigInt(weiStr);
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  // Keep 6 decimal precision
  const fracStr = (frac / 10n ** 12n).toString().padStart(6, "0");
  return Number(`${whole}.${fracStr}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = verifyCronSecret(req, { functionName: "bsc-deposit-poller", corsHeaders });
  if (!auth.ok) return auth.response!;

  try {
    const RPC_URL = Deno.env.get("BSC_RPC_URL");
    if (!RPC_URL) throw new Error("BSC_RPC_URL not configured");
    const admin = createClient(
      Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Current head
    const headHex = await rpc(RPC_URL, "eth_blockNumber", []);
    const head = Number(hexToBigInt(headHex));

    // 2. Last scanned block
    const { data: stateRow } = await admin
      .from("bsc_deposit_state")
      .select("last_scanned_block")
      .eq("id", 1)
      .maybeSingle();
    let from = stateRow ? Number(stateRow.last_scanned_block) + 1 : head - 5; // bootstrap: last 5 blocks

    // 3. Decide window (cap)
    const to = Math.min(head, from + MAX_BLOCKS_PER_RUN);
    if (from > to) {
      // Nothing new — still update confirmations for in-flight events
      await updateConfirmationsAndCredit(admin, head);
      return jsonOk({ scanned: 0, head });
    }

    // 4. Load watched addresses
    const { data: addrRows } = await admin
      .from("bsc_deposit_addresses")
      .select("user_id, address");
    const addrMap = new Map<string, string>();
    for (const r of addrRows || []) addrMap.set((r.address as string).toLowerCase(), r.user_id as string);

    // If no addresses, skip log fetch entirely (avoids RPC bandwidth waste / limits)
    const logs: any[] = [];
    if (addrMap.size > 0) {
      // Encode addresses as 32-byte topic values for eth_getLogs `topics[2]` filter
      const recipientTopics = Array.from(addrMap.keys()).map(
        (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0"),
      );
      // Chunk recipients (some RPCs cap topic array length) and block ranges
      const RECIP_CHUNK = 100;
      for (let start = from; start <= to; start += CHUNK_BLOCKS) {
        const end = Math.min(to, start + CHUNK_BLOCKS - 1);
        for (let ri = 0; ri < recipientTopics.length; ri += RECIP_CHUNK) {
          const recips = recipientTopics.slice(ri, ri + RECIP_CHUNK);
          const chunk: any[] = await rpc(RPC_URL, "eth_getLogs", [{
            fromBlock: "0x" + start.toString(16),
            toBlock: "0x" + end.toString(16),
            address: Object.keys(TOKENS),
            topics: [TRANSFER_TOPIC, null, recips],
          }]);
          logs.push(...chunk);
        }
      }
    }

    // 6. Filter logs where `to` is one of our addresses
    const inserts: any[] = [];
    for (const log of logs) {
      const to_addr = topicToAddress(log.topics[2]);
      const user_id = addrMap.get(to_addr);
      if (!user_id) continue;
      const tokenInfo = TOKENS[(log.address as string).toLowerCase()];
      if (!tokenInfo) continue;
      const amountUsd = wei18ToUsd(log.data); // data = amount (uint256)
      if (amountUsd < MIN_USD) continue;
      inserts.push({
        user_id,
        address: to_addr,
        token: tokenInfo.symbol,
        token_contract: (log.address as string).toLowerCase(),
        from_address: topicToAddress(log.topics[1]),
        tx_hash: log.transactionHash,
        log_index: Number(hexToBigInt(log.logIndex)),
        block_number: Number(hexToBigInt(log.blockNumber)),
        amount_wei: BigInt(log.data).toString(),
        amount_usd: amountUsd,
        confirmations: Math.max(0, head - Number(hexToBigInt(log.blockNumber))),
        status: "detected",
      });
    }

    if (inserts.length) {
      // upsert ignore-on-conflict so reorgs / retries are safe
      const { error } = await admin
        .from("bsc_deposit_events")
        .upsert(inserts, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
      if (error) console.error("event insert error:", error);
    }

    // 7. Advance state
    await admin.from("bsc_deposit_state").upsert({ id: 1, last_scanned_block: to, updated_at: new Date().toISOString() });

    // 8. Update confirmations & credit eligible
    const credited = await updateConfirmationsAndCredit(admin, head);

    return jsonOk({ scanned: to - from + 1, from, to, head, detected: inserts.length, credited });
  } catch (e) {
    console.error("bsc-deposit-poller error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function updateConfirmationsAndCredit(admin: any, head: number): Promise<number> {
  const { data: pending } = await admin
    .from("bsc_deposit_events")
    .select("id, block_number")
    .eq("status", "detected")
    .limit(500);
  if (!pending || !pending.length) return 0;

  let creditedCount = 0;
  for (const row of pending) {
    const confirmations = Math.max(0, head - Number(row.block_number));
    if (confirmations >= CONFIRMATIONS_REQUIRED) {
      const { error } = await admin.rpc("credit_bsc_deposit", { _event_id: row.id });
      if (error) console.error("credit_bsc_deposit failed", row.id, error.message);
      else creditedCount++;
    } else {
      await admin.from("bsc_deposit_events").update({ confirmations }).eq("id", row.id);
    }
  }
  return creditedCount;
}

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
