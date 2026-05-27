// Shared authentication helpers for "internal-only" edge functions —
// functions that should only be invoked by other server-side code or by
// authenticated admin users (never from the open internet anonymously).
//
// Two enforcement mechanisms are supported:
//   1) Shared internal secret header: `x-internal-secret` is compared in
//      constant time against `INTERNAL_FUNCTION_SECRET` env var. Server-side
//      callers (other edge functions, cron jobs) MUST attach this header.
//   2) Authenticated admin JWT: callers from the browser (admin tools) use
//      their normal Authorization bearer token; this helper verifies the JWT
//      and confirms the user holds `admin` or `super_admin` in `user_roles`.
//
// Either path satisfies the check. Anonymous requests with neither are
// rejected with a 401.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { constantTimeEqual } from "./cronAuth.ts";

const INTERNAL_HEADER = "x-internal-secret";

export interface InternalAuthOpts {
  functionName: string;
  corsHeaders: Record<string, string>;
  /**
   * If true, also allow callers presenting a valid user JWT whose user_id
   * has `admin` or `super_admin` role. Defaults to true.
   */
  allowAdminJwt?: boolean;
  /**
   * If provided, allow callers presenting a valid user JWT (any role) and
   * pass the user_id to this predicate. The predicate decides authorization
   * (e.g. ownership of the broadcast row). Returning true authorizes.
   */
  allowUser?: (userId: string) => Promise<boolean>;
}

export interface InternalAuthResult {
  ok: boolean;
  /** Present on success when authenticated via JWT; null when via secret. */
  userId: string | null;
  /** Present on failure: a Response ready to return. */
  response?: Response;
}

function logRejection(opts: InternalAuthOpts, req: Request, reason: string) {
  console.warn(JSON.stringify({
    event: "internal_auth_rejected",
    function: opts.functionName,
    reason,
    method: req.method,
    url_path: new URL(req.url).pathname,
    ip:
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for") ||
      null,
    user_agent: req.headers.get("user-agent") || null,
    has_internal_header: req.headers.get(INTERNAL_HEADER) !== null,
    has_authorization: !!req.headers.get("authorization"),
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Verify the request was made either with the shared internal secret OR
 * (optionally) by an authenticated admin user JWT.
 */
export async function verifyInternalOrAdmin(
  req: Request,
  opts: InternalAuthOpts,
): Promise<InternalAuthResult> {
  // --- Path 1: shared internal secret ---
  const expected = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const incoming = req.headers.get(INTERNAL_HEADER);
  if (expected && incoming && incoming.length === expected.length &&
      constantTimeEqual(incoming, expected)) {
    return { ok: true, userId: null };
  }

  // --- Path 2: admin/owner JWT ---
  const allowAdmin = opts.allowAdminJwt !== false;
  const allowUser = opts.allowUser;
  const authHeader = req.headers.get("authorization");
  if ((allowAdmin || allowUser) && authHeader?.startsWith("Bearer ")) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (supabaseUrl && anonKey) {
      const userClient: SupabaseClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      const userId = userData?.user?.id;
      if (!userErr && userId) {
        // Admin path
        if (allowAdmin) {
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
          if (serviceKey) {
            const admin = createClient(supabaseUrl, serviceKey);
            const { data: roles } = await admin
              .from("user_roles")
              .select("role")
              .eq("user_id", userId)
              .in("role", ["admin", "super_admin"])
              .limit(1);
            if (roles && roles.length > 0) {
              return { ok: true, userId };
            }
          }
        }
        // Owner path (caller-defined predicate)
        if (allowUser) {
          try {
            const ok = await allowUser(userId);
            if (ok) return { ok: true, userId };
          } catch (e) {
            console.warn("allowUser predicate error:", (e as Error).message);
          }
        }
      }
    }
  }

  logRejection(opts, req, "no_valid_credentials");
  return {
    ok: false,
    userId: null,
    response: new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
    }),
  };
}

/**
 * Convenience: header name + value for server-side callers invoking an
 * internal-only function via `supabase.functions.invoke(..., { headers })`.
 * Returns an empty object if the secret is not configured so callers that
 * fall back to admin JWT keep working in dev.
 */
export function internalAuthHeader(): Record<string, string> {
  const secret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  return secret ? { [INTERNAL_HEADER]: secret } : {};
}
