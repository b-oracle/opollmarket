// Automated re-verification job for BSC deposits in manual_review.
// - Picks the N stalest manual_review events whose backoff window has elapsed
// - Re-fetches eth_getTransactionReceipt and matches log_index/contract/recipient/amount_wei
// - Records last_reverify_status + last_reverify_details on the event
// - Tracks rpc_error / tx_missing / tx_failed counters SEPARATELY
// - On rpc_error: schedules next_reverify_at with exponential backoff and never
//   changes the final status of the deposit
// - On tx_missing / tx_failed: counters are bumped for visibility, but final
//   status stays manual_review (human decides) — only `mismatch` (clear forgery
//   evidence) auto-rejects after MAX_AUTO_REJECT_STRIKES consecutive hits
// - Writes an audit_logs entry (actor_id = NULL = system) for every check
//
// Designed to be called by pg_cron every few minutes. Idempotent and side-effect-light.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyCronSecret } from "../_shared/cronAuth.ts";
import { bscRpc } from "../_shared/bscRpc.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CONFIRMATIONS_REQUIRED = 12;
const BATCH_SIZE = 25;
const MAX_AUTO_REJECT_STRIKES = 3; // consecutive `mismatch` checks before auto-reject
// Exponential backoff for transient RPC errors (minutes). Capped at last value.
const RPC_BACKOFF_MINUTES = [1, 5, 15, 30, 60];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// RPC calls go through bscRpc → automatic fallback rotation + alerting.


type ReverifyOutcome =
  | "match"             // receipt still matches event exactly
  | "mismatch"          // receipt exists but log doesn't match
  | "tx_failed"         // receipt.status != 0x1
  | "tx_missing"        // receipt is null (dropped/reorged)
  | "rpc_error";        // RPC call failed — inconclusive, retried with backoff

function nextBackoffIso(rpcErrorCount: number): string {
  const idx = Math.min(rpcErrorCount, RPC_BACKOFF_MINUTES.length - 1);
  const minutes = RPC_BACKOFF_MINUTES[idx];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = verifyCronSecret(req, { functionName: "bsc-deposit-reverify", corsHeaders });
  if (!auth.ok) return auth.response!;

  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!Deno.env.get("BSC_RPC_URL")) return json({ error: "Server not configured" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull manual_review events that are due (next_reverify_at NULL OR <= now),
    // oldest-checked first (NULL last_reverified_at sorts first).
    const nowIso = new Date().toISOString();
    const { data: events, error: selErr } = await admin
      .from("bsc_deposit_events")
      .select("*")
      .eq("status", "manual_review")
      .or(`next_reverify_at.is.null,next_reverify_at.lte.${nowIso}`)
      .order("last_reverified_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);
    if (selErr) return json({ error: selErr.message }, 500);
    if (!events?.length) return json({ ok: true, checked: 0, summary: "no_due_review" });

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

      // ── Counter logic ─────────────────────────────────────────────────────
      // - `mismatch` is the ONLY outcome that increments the auto-reject strike
      //   counter (reverify_count). Three in a row → system_reject_bsc_deposit.
      // - `tx_missing`, `tx_failed`, `rpc_error` each bump their own dedicated
      //   counter for observability, but NEVER auto-change the final status.
      // - `match` resets the strike counter (others stay sticky as evidence).
      // - `rpc_error` also schedules a backoff window via next_reverify_at so
      //   we stop hammering a flaky upstream.
      const prevStrike = Number(ev.reverify_count ?? 0);
      const prevRpcErr = Number(ev.rpc_error_count ?? 0);
      const prevMissing = Number(ev.tx_missing_count ?? 0);
      const prevFailed = Number(ev.tx_failed_count ?? 0);

      const newStrike = outcome === "match" ? 0 : (outcome === "mismatch" ? prevStrike + 1 : prevStrike);
      const newRpcErr = outcome === "rpc_error" ? prevRpcErr + 1 : (outcome === "match" ? 0 : prevRpcErr);
      const newMissing = outcome === "tx_missing" ? prevMissing + 1 : prevMissing;
      const newFailed = outcome === "tx_failed" ? prevFailed + 1 : prevFailed;

      // Backoff: only RPC errors get a future next_reverify_at. Everything else
      // clears the backoff so the next cron tick re-examines it normally.
      const nextReverifyAt = outcome === "rpc_error" ? nextBackoffIso(newRpcErr) : null;

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
        counters: {
          mismatch_strike: newStrike,
          rpc_error: newRpcErr,
          tx_missing: newMissing,
          tx_failed: newFailed,
        },
        next_reverify_at: nextReverifyAt,
        checked_at: new Date().toISOString(),
      };

      // Persist tracking on the event row. Final `status` is intentionally NOT
      // touched here for tx_missing / tx_failed / rpc_error — only the
      // auto-reject path below (mismatch × 3) ever changes status.
      await admin
        .from("bsc_deposit_events")
        .update({
          last_reverified_at: new Date().toISOString(),
          last_reverify_status: outcome,
          last_reverify_details: details,
          reverify_count: newStrike,
          rpc_error_count: newRpcErr,
          tx_missing_count: newMissing,
          tx_failed_count: newFailed,
          next_reverify_at: nextReverifyAt,
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

      // Auto-reject ONLY on sustained `mismatch` — never on tx_missing/tx_failed/rpc_error.
      if (outcome === "mismatch" && newStrike >= MAX_AUTO_REJECT_STRIKES) {
        const reason = `Auto-rejected by reverify job: mismatch confirmed across ${newStrike} consecutive checks.`;
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
