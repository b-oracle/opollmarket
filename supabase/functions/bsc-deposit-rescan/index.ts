// User-facing trigger that re-runs the BSC deposit poller on demand.
// Authenticates the caller (any signed-in user), enforces a per-user
// cooldown, and forwards to bsc-deposit-poller using the cron secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COOLDOWN_MS = 20_000; // 20s per-user soft throttle
const lastRescanByUser = new Map<string, number>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    if (!CRON_SECRET) return json({ error: "Server not configured" }, 500);

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

    // Invoke the poller with the cron secret (server-to-server)
    const pollerUrl = `${SUPABASE_URL}/functions/v1/bsc-deposit-poller`;
    const r = await fetch(pollerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": CRON_SECRET,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      },
      body: JSON.stringify({ triggered_by: "user_rescan", user_id: userId }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "poller_failed", detail: body }, 502);

    return json({ ok: true, result: body });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
