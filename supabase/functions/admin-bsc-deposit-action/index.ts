// Admin action endpoint for BSC manual-review deposits.
// - Authenticates caller and verifies admin/super_admin role
// - Re-verifies the on-chain receipt for the event (independent confirmation)
// - Calls approve / reject RPC under service role
// - Writes a structured audit_logs entry with exact verification inputs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRMATIONS_REQUIRED = 12;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RPC_URL = Deno.env.get("BSC_RPC_URL");
    if (!RPC_URL) return json({ error: "Server not configured" }, 500);

    // Auth caller
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const actorId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Role check
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { event_id, action, reason } = body as {
      event_id?: string; action?: "approve" | "reject"; reason?: string;
    };
    if (!event_id || (action !== "approve" && action !== "reject")) {
      return json({ error: "event_id and action ('approve'|'reject') required" }, 400);
    }
    if (action === "reject" && (!reason || !reason.trim())) {
      return json({ error: "reason required for reject" }, 400);
    }

    // Load event
    const { data: ev, error: evErr } = await admin
      .from("bsc_deposit_events")
      .select("*")
      .eq("id", event_id)
      .maybeSingle();
    if (evErr || !ev) return json({ error: "Event not found" }, 404);
    if (ev.status === "credited") return json({ error: "Already credited" }, 409);

    // Load threshold for context
    const { data: thrRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "bsc_max_auto_credit_usd")
      .maybeSingle();
    const threshold = Number(thrRow?.value ?? 5000);

    // Re-verify on-chain receipt
    const head = Number(BigInt(await rpc(RPC_URL, "eth_blockNumber", [])));
    const confirmations = Math.max(0, head - Number(ev.block_number));
    let verification: Record<string, unknown> = {
      tx_hash: ev.tx_hash,
      log_index: ev.log_index,
      chain_head: head,
      confirmations_required: CONFIRMATIONS_REQUIRED,
      confirmations_observed: confirmations,
      expected: {
        token_contract: ev.token_contract,
        recipient: ev.address,
        amount_wei: String(ev.amount_wei),
        amount_usd: Number(ev.amount_usd),
      },
      threshold_usd: threshold,
      receipt_status: null as string | null,
      receipt_match: false,
      verified_at: new Date().toISOString(),
      rpc_error: null as string | null,
    };

    try {
      const receipt = await rpc(RPC_URL, "eth_getTransactionReceipt", [ev.tx_hash]);
      verification.receipt_status = receipt?.status ?? null;
      if (receipt?.status === "0x1") {
        const log = (receipt.logs || []).find((l: any) =>
          Number(BigInt(l.logIndex)) === Number(ev.log_index)
          && String(l.address).toLowerCase() === String(ev.token_contract).toLowerCase()
          && ("0x" + String(l.topics?.[2] ?? "").slice(-40)).toLowerCase() === String(ev.address).toLowerCase()
          && BigInt(l.data) === BigInt(ev.amount_wei),
        );
        verification.receipt_match = !!log;
        if (log) {
          verification = {
            ...verification,
            observed: {
              token_contract: String(log.address).toLowerCase(),
              recipient: "0x" + String(log.topics?.[2] ?? "").slice(-40).toLowerCase(),
              amount_wei: BigInt(log.data).toString(),
              block_number: Number(BigInt(log.blockNumber)),
            },
          };
        }
      }
    } catch (e) {
      verification.rpc_error = (e as Error).message;
    }

    // Perform action — approve requires verified receipt
    if (action === "approve") {
      if (!verification.receipt_match) {
        return json({
          error: "On-chain receipt does not match event — cannot approve. Reject or investigate.",
          verification,
        }, 422);
      }
      const { data: newTxId, error: rpcErr } = await admin
        .rpc("admin_approve_bsc_deposit", { _event_id: event_id });
      if (rpcErr) return json({ error: rpcErr.message, verification }, 500);

      await admin.from("audit_logs").insert({
        actor_id: actorId,
        action: "bsc_deposit_approve",
        target_id: event_id,
        target_type: "bsc_deposit_event",
        details: {
          credited_tx_id: newTxId,
          user_id: ev.user_id,
          amount_usd: Number(ev.amount_usd),
          token: ev.token,
          verification,
        },
      });

      return json({ ok: true, action: "approved", credited_tx_id: newTxId, verification });
    }

    // Reject
    const { error: rejErr } = await admin
      .rpc("admin_reject_bsc_deposit", { _event_id: event_id, _reason: reason!.trim() });
    if (rejErr) return json({ error: rejErr.message, verification }, 500);

    await admin.from("audit_logs").insert({
      actor_id: actorId,
      action: "bsc_deposit_reject",
      target_id: event_id,
      target_type: "bsc_deposit_event",
      details: {
        reason: reason!.trim(),
        user_id: ev.user_id,
        amount_usd: Number(ev.amount_usd),
        token: ev.token,
        verification,
      },
    });

    return json({ ok: true, action: "rejected", verification });
  } catch (e) {
    console.error("admin-bsc-deposit-action error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
