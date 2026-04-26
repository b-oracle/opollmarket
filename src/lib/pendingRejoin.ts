// Persists an in-flight call rejoin attempt to localStorage so that a
// page refresh, app background/resume, or webview restoration mid-loop
// can pick the flow back up. Keyed by conversationId; entries auto-expire
// after PENDING_TTL_MS so a stale callId never auto-joins a finished call.

const STORAGE_KEY = "opoll:pending-call-rejoin";
// Calls that are older than 90s are very likely already missed/declined
// server-side (matches the IncomingCallBanner auto-dismiss window).
export const PENDING_TTL_MS = 90_000;

type PendingRejoin = {
  callId: string;
  conversationId: string;
  expiresAt: number;
};

const safeReadAll = (): Record<string, PendingRejoin> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, PendingRejoin>;
  } catch {
    return {};
  }
};

const safeWriteAll = (entries: Record<string, PendingRejoin>) => {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(entries).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // Storage may be full or disabled — non-fatal.
  }
};

const pruneExpired = (
  entries: Record<string, PendingRejoin>,
): Record<string, PendingRejoin> => {
  const now = Date.now();
  const next: Record<string, PendingRejoin> = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v && v.expiresAt > now) next[k] = v;
  }
  return next;
};

export const writePendingRejoin = (
  conversationId: string,
  callId: string,
) => {
  if (!conversationId || !callId) return;
  const entries = pruneExpired(safeReadAll());
  entries[conversationId] = {
    callId,
    conversationId,
    expiresAt: Date.now() + PENDING_TTL_MS,
  };
  safeWriteAll(entries);
};

export const readPendingRejoin = (
  conversationId: string,
): PendingRejoin | null => {
  if (!conversationId) return null;
  const entries = pruneExpired(safeReadAll());
  // Persist the pruned set so expired entries don't accumulate.
  safeWriteAll(entries);
  return entries[conversationId] ?? null;
};

export const clearPendingRejoin = (conversationId: string) => {
  if (!conversationId) return;
  const entries = pruneExpired(safeReadAll());
  if (entries[conversationId]) {
    delete entries[conversationId];
    safeWriteAll(entries);
  }
};
