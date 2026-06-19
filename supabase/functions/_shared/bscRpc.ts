// Shared BSC JSON-RPC helper with primary/fallback rotation.
//
// Reads `BSC_RPC_URL` (required) and `BSC_RPC_URL_FALLBACK` (optional).
// On any error from the primary endpoint, retries once against the fallback.
// Surfaces a structured error containing both attempts for the caller's logs
// and (optionally) records a `system_alerts` row when BOTH endpoints fail.

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface BscRpcOptions {
  /** Pass an authenticated supabase admin client to emit `system_alerts` on total failure. */
  admin?: Admin;
  /** Source string for the alert row (e.g. function name). */
  alertSource?: string;
}

export function getBscRpcUrls(): { primary: string; fallback: string | null } {
  const primary = Deno.env.get("BSC_RPC_URL");
  if (!primary) throw new Error("BSC_RPC_URL not configured");
  const fallback = Deno.env.get("BSC_RPC_URL_FALLBACK") || null;
  return { primary, fallback };
}

function getBscRpcUrlCandidates(method: string): string[] {
  const { primary, fallback } = getBscRpcUrls();
  const logRpc = Deno.env.get("BSC_LOG_RPC_URL") || null;
  const publicLogFallbacks = method === "eth_getLogs"
    ? [
      "https://bsc-rpc.publicnode.com",
      "https://bsc.drpc.org",
      "https://bsc.rpc.blxrbdn.com",
      "https://bnb.api.onfinality.io/public",
    ]
    : [];
  return [logRpc, primary, fallback, ...publicLogFallbacks]
    .filter((url): url is string => !!url)
    .filter((url, idx, arr) => arr.indexOf(url) === idx);
}

async function callOne(url: string, method: string, params: unknown[]): Promise<unknown> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) {
    // deno-lint-ignore no-explicit-any
    const err: any = new Error(`${method} rpc error: ${JSON.stringify(j.error)}`);
    err.code = j.error.code;
    err.rpcMessage = j.error.message;
    throw err;
  }
  return j.result;
}

/**
 * JSON-RPC call against BSC with automatic fallback rotation.
 * If `BSC_RPC_URL_FALLBACK` is not set, behaves like a normal single-endpoint call.
 */
export async function bscRpc(
  method: string,
  params: unknown[],
  opts: BscRpcOptions = {},
): Promise<unknown> {
  const { primary, fallback } = getBscRpcUrls();
  try {
    return await callOne(primary, method, params);
  } catch (primaryErr) {
    if (!fallback) throw primaryErr;
    try {
      const result = await callOne(fallback, method, params);
      // Warn-level alert: primary degraded but we recovered via fallback.
      if (opts.admin && opts.alertSource) {
        try {
          await opts.admin.rpc("record_system_alert", {
            _severity: "warning",
            _source: opts.alertSource,
            _code: "bsc_rpc_primary_failover",
            _message: `Primary BSC RPC failed, served via fallback: ${(primaryErr as Error).message}`,
            _details: { method, primary_error: (primaryErr as Error).message },
            _dedupe_minutes: 10,
          });
        } catch (_) { /* swallow */ }
      }
      return result;
    } catch (fallbackErr) {
      if (opts.admin && opts.alertSource) {
        try {
          await opts.admin.rpc("record_system_alert", {
            _severity: "critical",
            _source: opts.alertSource,
            _code: "bsc_rpc_total_failure",
            _message: `Both BSC RPCs failed for ${method}.`,
            _details: {
              method,
              primary_error: (primaryErr as Error).message,
              fallback_error: (fallbackErr as Error).message,
            },
            _dedupe_minutes: 5,
          });
        } catch (_) { /* swallow */ }
      }
      // deno-lint-ignore no-explicit-any
      const wrapped: any = new Error(
        `bscRpc both endpoints failed (${method}): primary=${(primaryErr as Error).message}; fallback=${(fallbackErr as Error).message}`,
      );
      wrapped.primaryError = primaryErr;
      wrapped.fallbackError = fallbackErr;
      throw wrapped;
    }
  }
}
