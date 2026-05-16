// User-facing rescan: refreshes confirmations ONLY for the caller's
// currently-pending deposits. No block-range log scan — just one
// eth_blockNumber call + per-row updates. Credits any rows that have
// crossed the confirmation threshold.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONFIRMATIONS_REQUIRED = 12;
const COOLDOWN_MS = 20_000; // 20s per-user soft throttle
const lastRescanByUser = new Map<string, number>();

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
  if (j.error) throw new Error(`${method} rpc error: ${JSON.stringify(j.error)}`);
  return j.result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RPC_URL = Deno.env.get("BSC_RPC_URL");
    if (!RPC_URL) return json({ error: "Server not configured" }, 500);

    // Authenticate caller
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Per-user cooldown
    const last = lastRescanByUser.get(userId) || 0;
    const now = Date.now();
    const remaining = COOLDOWN_MS - (now - last);
    if (remaining > 0) {
      return json({ error: "cooldown", retry_after_ms: remaining }, 429);
    }
    lastRescanByUser.set(userId, now);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Load this user's pending deposits only
    const { data: pending, error: pendingErr } = await admin
      .from("bsc_deposit_events")
      .select("id, block_number")
      .eq("user_id", userId)
      .eq("status", "detected")
      .limit(200);
    if (pendingErr) return json({ error: pendingErr.message }, 500);

    if (!pending || pending.length === 0) {
      return json({ ok: true, pending: 0, updated: 0, credited: 0, message: "No pending deposits." });
    }

    // 2. Single RPC call for current chain head
    const headHex = await rpc(RPC_URL, "eth_blockNumber", []);
    const head = Number(BigInt(headHex));

    // 3. Update confirmations / credit eligible
    let updated = 0;
    let credited = 0;
    for (const row of pending) {
      const confirmations = Math.max(0, head - Number(row.block_number));
      if (confirmations >= CONFIRMATIONS_REQUIRED) {
        const { error } = await admin.rpc("credit_bsc_deposit", { _event_id: row.id });
        if (!error) credited++;
      } else {
        const { error } = await admin
          .from("bsc_deposit_events")
          .update({ confirmations })
          .eq("id", row.id);
        if (!error) updated++;
      }
    }

    return json({
      ok: true,
      pending: pending.length,
      updated,
      credited,
      head,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
