// Automated re-verification job for BSC deposits in manual_review.
// - Picks the N stalest manual_review events (NULL last_reverified_at first)
// - Re-fetches eth_getTransactionReceipt and matches log_index/contract/recipient/amount_wei
// - Records last_reverify_status + last_reverify_details on the event
// - Writes an audit_logs entry (actor_id = NULL = system)
// - Auto-rejects events whose receipt has gone missing/mutated after MAX_AUTO_REJECT_STRIKES
//   consecutive mismatch checks (chain reorg, dropped tx, etc.)
//
// Designed to be called by pg_cron every few minutes. Idempotent and side-effect-light.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRMATIONS_REQUIRED = 12;
const BATCH_SIZE = 25;
const MAX_AUTO_REJECT_STRIKES = 3; // consecutive failed re-verifications before auto-reject

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

type ReverifyOutcome =
  | "match"             // receipt still matches event exactly
  | "mismatch"          // receipt exists but log doesn't match
  | "tx_failed"         // receipt.status != 0x1
  | "tx_missing"        // receipt is null (dropped/reorged)
  | "rpc_error";        // RPC call failed — inconclusive, not a strike

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RPC_URL = Deno.env.get("BSC_RPC_URL");
    if (!RPC_URL) return json({ error: "Server not configured" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull oldest-checked manual_review events first (NULL last_reverified_at sorts first)
    const { data: events, error: selErr } = await admin
      .from("bsc_deposit_events")
      .select("*")
      .eq("status", "manual_review")
      .order("last_reverified_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);
    if (selErr) return json({ error: selErr.message }, 500);
    if (!events?.length) return json({ ok: true, checked: 0, summary: "no_pending_review" });

    // Threshold context (for audit trail)
    const { data: thrRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "bsc_max_auto_credit_usd")
      .maybeSingle();
    const threshold = Number(thrRow?.value ?? 5000);

    let head: number;
    try {
      head = Number(BigInt(await rpc(RPC_URL, "eth_blockNumber", [])));
    } catch (e) {
      return json({ error: `head fetch failed: ${(e as Error).message}` }, 502);
    }

    const counts = { match: 0, mismatch: 0, tx_failed: 0, tx_missing: 0, rpc_error: 0, auto_rejected: 0 };

    for (const ev of events) {
      let outcome: ReverifyOutcome = "rpc_error";
      let rpcError: string | null = null;
      let observed: Record<string, unknown> | null = null;
      let receiptStatus: string | null = null;
      const confirmations = Math.max(0, head - Number(ev.block_number));

      try {
        const receipt = await rpc(RPC_URL, "eth_getTransactionReceipt", [ev.tx_hash]);
        if (!receipt) {
          outcome = "tx_missing";
        } else {
          receiptStatus = receipt.status ?? null;
          if (receipt.status !== "0x1") {
            outcome = "tx_failed";
          } else {
            const log = (receipt.logs || []).find((l: any) =>
              Number(BigInt(l.logIndex)) === Number(ev.log_index)
              && String(l.address).toLowerCase() === String(ev.token_contract).toLowerCase()
              && ("0x" + String(l.topics?.[2] ?? "").slice(-40)).toLowerCase() === String(ev.address).toLowerCase()
              && BigInt(l.data) === BigInt(ev.amount_wei),
            );
            if (log) {
              outcome = "match";
              observed = {
                token_contract: String(log.address).toLowerCase(),
                recipient: "0x" + String(log.topics?.[2] ?? "").slice(-40).toLowerCase(),
                amount_wei: BigInt(log.data).toString(),
                block_number: Number(BigInt(log.blockNumber)),
              };
            } else {
              outcome = "mismatch";
            }
          }
        }
      } catch (e) {
        outcome = "rpc_error";
        rpcError = (e as Error).message;
      }

      counts[outcome]++;

      // Strike count: only "real" negative outcomes count toward auto-rejection.
      // rpc_error is inconclusive; match resets the counter.
      const prev = Number(ev.reverify_count ?? 0);
      const isNegative = outcome === "mismatch" || outcome === "tx_failed" || outcome === "tx_missing";
      const newCount = outcome === "match" ? 0 : (outcome === "rpc_error" ? prev : prev + 1);

      const details = {
        outcome,
        tx_hash: ev.tx_hash,
        log_index: ev.log_index,
        chain_head: head,
        confirmations_observed: confirmations,
        confirmations_required: CONFIRMATIONS_REQUIRED,
        threshold_usd: threshold,
        expected: {
          token_contract: ev.token_contract,
          recipient: ev.address,
          amount_wei: String(ev.amount_wei),
          amount_usd: Number(ev.amount_usd),
        },
        observed,
        receipt_status: receiptStatus,
        rpc_error: rpcError,
        strike_count: newCount,
        checked_at: new Date().toISOString(),
      };

      // Persist tracking on the event row
      await admin
        .from("bsc_deposit_events")
        .update({
          last_reverified_at: new Date().toISOString(),
          last_reverify_status: outcome,
          last_reverify_details: details,
          reverify_count: newCount,
        })
        .eq("id", ev.id);

      // Audit log every check
      await admin.from("audit_logs").insert({
        actor_id: null, // system actor
        action: "bsc_deposit_reverify",
        target_id: ev.id,
        target_type: "bsc_deposit_event",
        details: {
          user_id: ev.user_id,
          amount_usd: Number(ev.amount_usd),
          token: ev.token,
          verification: details,
        },
      });

      // Auto-reject if we've seen a real negative outcome MAX_AUTO_REJECT_STRIKES times in a row.
      // This catches dropped/reorged/mutated receipts without ever touching balances.
      if (isNegative && newCount >= MAX_AUTO_REJECT_STRIKES) {
        const reason = `Auto-rejected by reverify job: ${outcome} confirmed across ${newCount} consecutive checks.`;
        const { error: rejErr } = await admin
          .rpc("system_reject_bsc_deposit", { _event_id: ev.id, _reason: reason });
        if (!rejErr) {
          counts.auto_rejected++;
          await admin.from("audit_logs").insert({
            actor_id: null,
            action: "bsc_deposit_auto_reject",
            target_id: ev.id,
            target_type: "bsc_deposit_event",
            details: {
              user_id: ev.user_id,
              amount_usd: Number(ev.amount_usd),
              token: ev.token,
              reason,
              verification: details,
            },
          });
        } else {
          console.error("auto-reject failed:", ev.id, rejErr.message);
        }
      }
    }

    return json({ ok: true, checked: events.length, counts, head });
  } catch (e) {
    console.error("bsc-deposit-reverify error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
