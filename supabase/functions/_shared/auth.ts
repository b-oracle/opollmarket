// Shared helper for adding auth + simple per-user rate limit to AI endpoints.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function requireAuthAndRateLimit(
  req: Request,
  opts: { perMinute?: number } = {}
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  const userId = data.user.id;
  const limit = opts.perMinute ?? 20;
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b || now > b.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + 60_000 });
  } else {
    if (b.count >= limit) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
      };
    }
    b.count++;
  }
  return { ok: true, userId };
}
