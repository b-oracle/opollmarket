// Lightweight in-memory ring buffer for call lifecycle diagnostics.
// Used to power the developer overlay in VoiceCallOverlay so we can see
// — at a glance — exactly why a call disconnected immediately after pickup
// (e.g., mic denied, transient ParticipantDisconnected, auto-reconnect
// race, server-side status flip to "ended").

export type CallLifecycleStage =
  | "overlay_mount"
  | "livekit_connect_start"
  | "livekit_connected"
  | "livekit_connect_failed"
  | "mic_enable_ok"
  | "mic_enable_failed"
  | "mic_permission_preflight"
  | "camera_enable_failed"
  | "participant_connected"
  | "participant_disconnected"
  | "participant_disconnected_ignored"
  | "track_subscribed"
  | "track_unsubscribed"
  | "room_disconnected"
  | "auto_reconnect_start"
  | "auto_reconnect_attempt"
  | "auto_reconnect_fresh_token"
  | "auto_reconnect_fresh_token_failed"
  | "auto_reconnect_ok"
  | "auto_reconnect_failed"
  | "grace_period_started"
  | "grace_period_expired"
  | "remote_status_change"
  | "user_end"
  | "user_cancel"
  | "no_answer_timeout"
  | "inactivity_timeout"
  | "show_rejoin"
  | "rejoin_attempt"
  | "rejoin_failed"
  | "resources_release_start"
  | "resources_released"
  | "keepawake_started"
  | "keepawake_stopped"
  | "missed_remote"
  | "info";

export interface CallLifecycleEntry {
  id: string;
  callId: string;
  stage: CallLifecycleStage;
  message?: string;
  status?: string;
  data?: Record<string, unknown>;
  ts: number;
  level: "info" | "warn" | "error";
}

const MAX_ENTRIES = 200;
const buffer: CallLifecycleEntry[] = [];
const listeners = new Set<(entries: CallLifecycleEntry[]) => void>();

const emit = () => {
  const snapshot = buffer.slice();
  listeners.forEach((l) => {
    try { l(snapshot); } catch { /* ignore */ }
  });
};

export const recordCallLifecycle = (
  callId: string,
  stage: CallLifecycleStage,
  details: { message?: string; status?: string; data?: Record<string, unknown>; level?: "info" | "warn" | "error" } = {},
): CallLifecycleEntry => {
  const entry: CallLifecycleEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    callId,
    stage,
    message: details.message,
    status: details.status,
    data: details.data,
    ts: Date.now(),
    level: details.level ?? "info",
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  // Mirror to console for live debugging in browser/Logcat.
  const tag = `[call:${callId.slice(0, 8)}] ${stage}`;
  const payload = { status: entry.status, ...entry.data };
  if (entry.level === "error") console.error(tag, payload);
  else if (entry.level === "warn") console.warn(tag, payload);
  else console.log(tag, payload);
  emit();
  return entry;
};

export const getCallLifecycleEntries = (callId?: string): CallLifecycleEntry[] => {
  if (!callId) return buffer.slice();
  return buffer.filter((e) => e.callId === callId);
};

export const clearCallLifecycleEntries = (callId?: string) => {
  if (!callId) {
    buffer.length = 0;
  } else {
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (buffer[i].callId === callId) buffer.splice(i, 1);
    }
  }
  emit();
};

export const subscribeCallLifecycle = (
  listener: (entries: CallLifecycleEntry[]) => void,
): (() => void) => {
  listeners.add(listener);
  // Push initial snapshot immediately
  listener(buffer.slice());
  return () => { listeners.delete(listener); };
};

// LocalStorage flag — toggle dev overlay without rebuilding the app.
const FLAG_KEY = "call-lifecycle-debug";

export const isCallDebugEnabled = (): boolean => {
  try {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem(FLAG_KEY) === "1") return true;
    // Also auto-enable on dev / preview hosts so we can inspect easily.
    const host = window.location.hostname;
    if (host === "localhost" || host.endsWith(".lovable.app")) return true;
    return false;
  } catch {
    return false;
  }
};

export const setCallDebugEnabled = (enabled: boolean) => {
  try {
    if (enabled) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch { /* ignore */ }
};
