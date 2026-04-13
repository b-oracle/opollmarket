/**
 * Canonical origin for authentication redirects.
 * Forces all auth flows to use the primary domain so sessions are consistent
 * regardless of whether users visit via www or non-www.
 */
export const CANONICAL_ORIGIN = "https://www.opoll.org";

/**
 * Returns the canonical origin if running on a known production domain,
 * otherwise falls back to window.location.origin (for dev/preview).
 */
export function getCanonicalOrigin(): string {
  const origin = window.location.origin;
  if (origin.includes("opoll.org") || origin.includes("opollmarket.com")) {
    return CANONICAL_ORIGIN;
  }
  return origin;
}
