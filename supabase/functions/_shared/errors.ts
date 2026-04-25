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
