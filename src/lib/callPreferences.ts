// Persists per-call media preferences (mic muted, camera on) across
// auto-reconnects, manual rejoins, and even full page reloads. The
// VoiceCallOverlay reads these on connect and after every reconnect so
// the user's intent (e.g., "I muted myself") survives a dropped WSS.

const STORAGE_KEY = "call-media-prefs-v1";
const MAX_ENTRIES = 8; // keep last few calls — small footprint

export interface CallMediaPreferences {
  muted: boolean;
  cameraOn: boolean;
  facingMode?: "user" | "environment";
  updatedAt: number;
}

type Store = Record<string, CallMediaPreferences>;

const readStore = (): Store => {
  try {
    if (typeof window === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (store: Store) => {
  try {
    // Trim to most recent N entries to bound localStorage usage.
    const entries = Object.entries(store)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_ENTRIES);
    const trimmed: Store = {};
    for (const [k, v] of entries) trimmed[k] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota / serialization errors
  }
};

export const loadCallPreferences = (
  callId: string,
): CallMediaPreferences | null => {
  if (!callId) return null;
  const store = readStore();
  return store[callId] ?? null;
};

export const saveCallPreferences = (
  callId: string,
  prefs: Partial<Omit<CallMediaPreferences, "updatedAt">>,
): void => {
  if (!callId) return;
  const store = readStore();
  const existing = store[callId] ?? { muted: false, cameraOn: false, updatedAt: 0 };
  store[callId] = {
    ...existing,
    ...prefs,
    updatedAt: Date.now(),
  };
  writeStore(store);
};

export const clearCallPreferences = (callId: string): void => {
  if (!callId) return;
  const store = readStore();
  if (store[callId]) {
    delete store[callId];
    writeStore(store);
  }
};
