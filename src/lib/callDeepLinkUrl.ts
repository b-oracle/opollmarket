// Helpers for handling call deep-link URL parameters.
//
// When a user taps an OS notification ("opoll://call/accept?call_id=...&auto_accept=1"),
// the app navigates to /messages/<id>?call_id=...&auto_accept=1 — preserving any
// existing query string (utm_*, ref, share IDs, etc.). After the auto-join attempt
// resolves we strip ONLY the call params and leave every other param intact so
// analytics/attribution tracking isn't lost.

const CALL_DEEP_LINK_PARAMS = ["auto_accept", "call_id"] as const;

/**
 * Returns a new URLSearchParams (or string) with the call deep-link params
 * removed. All other params are preserved exactly as-is, including duplicates
 * and ordering of unrelated keys.
 */
export const stripCallDeepLinkParams = (
  current: URLSearchParams | string,
): URLSearchParams => {
  const next = new URLSearchParams(
    typeof current === "string" ? current : current.toString(),
  );
  for (const key of CALL_DEEP_LINK_PARAMS) {
    next.delete(key);
  }
  return next;
};

export const callDeepLinkParamKeys = CALL_DEEP_LINK_PARAMS;
