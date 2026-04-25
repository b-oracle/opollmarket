/**
 * Exponential backoff schedule for outbound webhook retries.
 * After `BACKOFF_MINUTES.length` attempts, the event is marked dead-lettered.
 *
 * Schedule (attempt number → delay before next try):
 *   1 → 1m, 2 → 5m, 3 → 30m, 4 → 2h, 5 → 12h
 */
export const BACKOFF_MINUTES = [1, 5, 30, 120, 720];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

/**
 * Given the number of attempts already made, return the next retry timestamp,
 * or `null` if the event has exhausted all retries (and should be dead-lettered).
 */
export function nextRetryAt(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const minutes = BACKOFF_MINUTES[attempts] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
