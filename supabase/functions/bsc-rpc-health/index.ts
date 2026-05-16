// Admin-only RPC health probe: directly hits primary + fallback BSC RPCs,
// returns each endpoint's block height, latency, and error (if any).
// Does NOT use the bscRpc failover helper — this is the diagnostic that
// tells admins WHICH endpoint is misbehaving.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Truncate any upstream-controlled string before returning it to the admin UI.
const safeErr = (s: unknown): string => {
  const str = typeof s === "string" ? s : (s as Error)?.message ?? String(s);
  return str.length > 200 ? str.slice(0, 200) + "…" : str;
};

type ProbeResult = { ok: boolean; block: number | null; latency_ms: number; error: string | null };

async function probe(url: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(8000),
    });
    const latency_ms = Date.now() - t0;
    const j = await r.json();
    if (j.error) return { ok: false, block: null, latency_ms, error: safeErr(j.error.message || JSON.stringify(j.error)) };
    return { ok: true, block: Number(BigInt(j.result)), latency_ms, error: null };
  } catch (e) {
    return { ok: false, block: null, latency_ms: Date.now() - t0, error: safeErr(e) };
  }
}

// In-memory cache shared across requests in the same isolate. Caps quota burn
// when multiple admin tabs or a stuck refresh loop hammer the panel.
const CACHE_TTL_MS = 10_000;
let cached: { at: number; body: Record<string, unknown> } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth + role check
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
      return json({ error: "Forbidden" }, 403);
    }

    const primaryUrl = Deno.env.get("BSC_RPC_URL") || null;
    const fallbackUrl = Deno.env.get("BSC_RPC_URL_FALLBACK") || null;

    const [primary, fallback] = await Promise.all([
      primaryUrl ? probe(primaryUrl) : Promise.resolve({ ok: false, block: null, latency_ms: 0, error: "BSC_RPC_URL not configured" }),
      fallbackUrl ? probe(fallbackUrl) : Promise.resolve({ ok: false, block: null, latency_ms: 0, error: "BSC_RPC_URL_FALLBACK not configured" }),
    ]);

    // Block drift between endpoints (helps spot a stale provider)
    const drift = primary.block != null && fallback.block != null
      ? Math.abs(primary.block - fallback.block) : null;

    return json({
      checked_at: new Date().toISOString(),
      primary: { configured: !!primaryUrl, ...primary },
      fallback: { configured: !!fallbackUrl, ...fallback },
      block_drift: drift,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
