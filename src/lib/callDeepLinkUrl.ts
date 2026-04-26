// Helpers for handling call deep-link URL parameters.
//
// When a user taps an OS notification ("opoll://call/accept?call_id=...&auto_accept=1"),
// the app navigates to /messages/<id>?call_id=...&auto_accept=1 — preserving any
// existing query string (utm_*, ref, share IDs, etc.). After the auto-join attempt
// resolves we strip ONLY the call params and leave every other param intact so
// analytics/attribution tracking isn't lost.

const CALL_DEEP_LINK_PARAMS = ["auto_accept", "call_id"] as const;

/**
 * Returns a new URLSearchParams with the call deep-link params removed. All
 * other params are preserved exactly as-is, including duplicates and ordering
 * of unrelated keys. Does NOT mutate the input.
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

// dm_calls.id is a Postgres uuid (v4 today). We accept any RFC 4122 UUID
// shape so a future migration to v7/v8 doesn't break this check, but we
// reject anything non-UUID to keep malformed, malicious, or stale deep
// links from triggering a rejoin attempt against a random server row.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidCallId = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  // Trim defensively — some launchers append trailing whitespace.
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  return UUID_RE.test(trimmed);
};

/**
 * Reads the auto-accept intent from a URLSearchParams. Returns the validated
 * call_id only when:
 *   - auto_accept === "1"
 *   - call_id is present and matches a UUID shape
 * Otherwise returns null. Callers should treat null as "no valid intent" and
 * silently strip the params without attempting a rejoin.
 */
export const parseAutoAcceptIntent = (
  params: URLSearchParams,
): { callId: string } | null => {
  if (params.get("auto_accept") !== "1") return null;
  const raw = params.get("call_id");
  if (!isValidCallId(raw)) return null;
  return { callId: raw.trim() };
};
