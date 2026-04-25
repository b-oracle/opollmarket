/**
 * Safely extract a human-readable error message from an unknown value.
 * Use in `catch (err)` blocks where `err` is typed as `unknown`.
 */
export function getErrorMessage(err: unknown, fallback = "Internal server error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const maybe = err as { message?: unknown; error?: unknown };
    if (typeof maybe.message === "string") return maybe.message;
    if (typeof maybe.error === "string") return maybe.error;
    try {
      return JSON.stringify(err);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Build a standard JSON error Response. Type-safe wrapper that accepts `unknown`
 * errors from `catch` blocks and never throws on serialization.
 *
 * Usage:
 *   } catch (err) {
 *     return errorResponse(err, 500, corsHeaders);
 *   }
 */
export function errorResponse(
  err: unknown,
  status = 500,
  extraHeaders: Record<string, string> = {},
  fallback = "Internal server error",
): Response {
  const message = getErrorMessage(err, fallback);
  let body: string;
  try {
    body = JSON.stringify({ error: message });
  } catch {
    body = `{"error":"${fallback.replace(/"/g, '\\"')}"}`;
  }
  return new Response(body, {
    status,
    headers: { ...extraHeaders, "Content-Type": "application/json" },
  });
}
