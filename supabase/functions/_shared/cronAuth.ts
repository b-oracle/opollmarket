// Shared helper for validating cron-secret-protected edge functions.
// Logs rejections in a structured form WITHOUT leaking the secret value.
// Uses a constant-time comparison to mitigate timing-attack risks.

export interface CronAuthResult {
  ok: boolean;
  response?: Response;
}

interface VerifyOpts {
  functionName: string;
  corsHeaders: Record<string, string>;
}

/**
 * Constant-time byte comparison. Always iterates over the full length of
 * `expected` so the runtime is not influenced by where the first mismatch
 * occurs. Length-mismatched inputs short-circuit (length itself is not a
 * sensitive value here — the secret length is fixed and known).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

/**
 * Verify the `x-cron-secret` header against the CRON_SECRET env var.
 * On failure, emits a structured `cron_auth_rejected` log line and returns
 * a 401 Response. The secret itself is never logged — only metadata about
 * the request (caller IP, user agent, header presence/length, reason).
 */
export function verifyCronSecret(req: Request, opts: VerifyOpts): CronAuthResult {
  const expected = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");

  let reason: string | null = null;
  if (!expected) reason = "server_missing_secret";
  else if (!incoming) reason = "missing_header";
  else if (incoming.length !== expected.length) reason = "length_mismatch";
  else if (!constantTimeEqual(incoming, expected)) reason = "value_mismatch";

  if (!reason) return { ok: true };

  // Structured rejection log — safe to inspect; no secret material included.
  const logEntry = {
    event: "cron_auth_rejected",
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
    has_authorization: !!req.headers.get("authorization"),
    has_cron_header: incoming !== null,
    cron_header_length: incoming?.length ?? 0,
    timestamp: new Date().toISOString(),
  };
  console.warn(JSON.stringify(logEntry));

  return {
    ok: false,
    response: new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
    }),
  };
}
