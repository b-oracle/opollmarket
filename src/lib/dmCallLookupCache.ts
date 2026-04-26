// In-memory + localStorage cache for dm_calls.conversation_id lookups.
//
// The auto-accept retry loop in ChatView calls supabase to resolve which
// conversation a given call_id belongs to. With polling + retry-after-failure
// we can hit this lookup multiple times for the same call within seconds.
// Caching the (call_id → conversation_id) mapping eliminates redundant
// network round-trips while the user is reconnecting.
//
// Layered design:
//   - moduleCache  : Map kept across re-mounts but lost on full reload.
//   - localStorage : survives reloads + native app restarts. Lazy-hydrated
//                    on first read, lazy-persisted on first write. Bounded
//                    via simple FIFO eviction so we never grow unbounded.
//
// Entries are cheap (UUID → UUID, ~80 bytes each) and call IDs are immutable
// once issued by the server, so cached values never go stale. We still
// expose `clearCallLookupCache` for tests and explicit invalidation if a
// future migration ever changes the mapping.

const STORAGE_KEY = "dm_call_lookup_cache_v1";
const MAX_ENTRIES = 100; // FIFO bound; ample for typical call history

const moduleCache = new Map<string, string>();
let hydrated = false;

const safeWindow = (): Window | null => {
  try {
    return typeof window !== "undefined" ? window : null;
  } catch {
    return null;
  }
};

const hydrateFromStorage = () => {
  if (hydrated) return;
  hydrated = true;
  const w = safeWindow();
  if (!w?.localStorage) return;
  try {
    const raw = w.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === "string" && typeof v === "string") {
          moduleCache.set(k, v);
        }
      }
    }
  } catch (e) {
    // Corrupt JSON or quota error — start fresh, never throw to callers.
    console.warn("dmCallLookupCache: hydrate failed", e);
  }
};

const persistToStorage = () => {
  const w = safeWindow();
  if (!w?.localStorage) return;
  try {
    // Trim to MAX_ENTRIES (oldest-first via insertion order) before writing.
    while (moduleCache.size > MAX_ENTRIES) {
      const oldestKey = moduleCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      moduleCache.delete(oldestKey);
    }
    const obj: Record<string, string> = {};
    for (const [k, v] of moduleCache.entries()) obj[k] = v;
    w.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    // Quota exceeded or storage disabled — non-fatal, in-memory still works.
    console.warn("dmCallLookupCache: persist failed", e);
  }
};

export const getCachedCallConversation = (callId: string): string | null => {
  if (!callId) return null;
  hydrateFromStorage();
  return moduleCache.get(callId) ?? null;
};

export const setCachedCallConversation = (
  callId: string,
  conversationId: string,
): void => {
  if (!callId || !conversationId) return;
  hydrateFromStorage();
  // Re-insert to refresh recency for FIFO eviction.
  moduleCache.delete(callId);
  moduleCache.set(callId, conversationId);
  persistToStorage();
};

export const clearCallLookupCache = (): void => {
  moduleCache.clear();
  hydrated = true; // skip re-hydration after explicit clear
  const w = safeWindow();
  try {
    w?.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
