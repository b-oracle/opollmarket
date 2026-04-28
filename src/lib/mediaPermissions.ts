export type MicrophonePermissionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unsupported" | "denied" | "not_found" | "busy" | "unknown";
      title: string;
      description: string;
      errorName?: string;
      errorMessage?: string;
    };

const STORAGE_KEY = "mic-permission-cache-v1";
type CachedState = "granted" | "denied" | "not_found" | "busy" | "unsupported";
interface CachedEntry {
  state: CachedState;
  reason?: "unsupported" | "denied" | "not_found" | "busy" | "unknown";
  errorName?: string;
  errorMessage?: string;
  ts: number;
}

const stopStream = (stream: MediaStream) => {
  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // ignore cleanup errors
  }
};

const readCache = (): CachedEntry | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed || typeof parsed.state !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCache = (entry: CachedEntry | null) => {
  try {
    if (!entry) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    }
  } catch {
    // ignore
  }
};

const buildResultFromCache = (entry: CachedEntry): MicrophonePermissionResult | null => {
  if (entry.state === "granted") return { ok: true };
  if (entry.state === "denied") {
    return {
      ok: false,
      reason: "denied",
      title: "Microphone permission denied",
      description: "Enable microphone access in the app settings, then try the call again.",
      errorName: entry.errorName,
      errorMessage: entry.errorMessage,
    };
  }
  if (entry.state === "not_found") {
    return {
      ok: false,
      reason: "not_found",
      title: "No microphone found",
      description: "Connect or enable a microphone, then try again.",
      errorName: entry.errorName,
      errorMessage: entry.errorMessage,
    };
  }
  if (entry.state === "unsupported") {
    return {
      ok: false,
      reason: "unsupported",
      title: "Microphone unavailable",
      description: "This app build cannot access the microphone on this device.",
    };
  }
  // "busy" — don't trust cache, force re-check
  return null;
};

// Subscribe to permission changes once so cache invalidates automatically.
let permissionListenerAttached = false;
const attachPermissionListener = async () => {
  if (permissionListenerAttached) return;
  permissionListenerAttached = true;
  try {
    if (!navigator.permissions?.query) return;
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    const sync = () => {
      if (status.state === "granted") {
        writeCache({ state: "granted", ts: Date.now() });
      } else if (status.state === "denied") {
        writeCache({ state: "denied", reason: "denied", ts: Date.now() });
      } else {
        writeCache(null); // "prompt" — clear so next attempt re-asks
      }
    };
    status.onchange = sync;
  } catch {
    // ignore — Android WebView often lacks "microphone" in Permissions API
  }
};

export const clearMicrophonePermissionCache = () => writeCache(null);

// Native (Capacitor) microphone permission preflight. On Android the WebView's
// getUserMedia call won't prompt unless the host app has been granted the
// RECORD_AUDIO runtime permission. This helper requests it explicitly so the
// call doesn't silently fail right after pickup.
const requestNativeMicPermission = async (): Promise<
  | { handled: true; result: MicrophonePermissionResult }
  | { handled: false }
> => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor?.isNativePlatform?.()) return { handled: false };
    const mod: any = await import("@mozartec/capacitor-microphone");
    const Microphone = mod?.Microphone;
    if (!Microphone) return { handled: false };

    let status: any = null;
    try { status = await Microphone.checkPermissions(); } catch { /* ignore */ }
    let state: string = status?.microphone || "prompt";

    if (state !== "granted") {
      try {
        const req = await Microphone.requestPermissions();
        state = req?.microphone || state;
      } catch { /* ignore */ }
    }

    if (state === "granted") {
      writeCache({ state: "granted", ts: Date.now() });
      return { handled: true, result: { ok: true } };
    }
    if (state === "denied") {
      writeCache({ state: "denied", reason: "denied", errorName: "NativePermissionDenied", ts: Date.now() });
      return {
        handled: true,
        result: {
          ok: false,
          reason: "denied",
          title: "Microphone permission denied",
          description: "Open the app's system settings, enable Microphone, then try the call again.",
          errorName: "NativePermissionDenied",
        },
      };
    }
    // "prompt" or unknown → fall through to the web getUserMedia path
    return { handled: false };
  } catch {
    return { handled: false };
  }
};

export const ensureMicrophonePermission = async (): Promise<MicrophonePermissionResult> => {
  // Native preflight first — short-circuits the web path on Capacitor.
  const native = await requestNativeMicPermission();
  if (native.handled) return native.result;

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    const result: MicrophonePermissionResult = {
      ok: false,
      reason: "unsupported",
      title: "Microphone unavailable",
      description: "This app build cannot access the microphone on this device.",
    };
    writeCache({ state: "unsupported", reason: "unsupported", ts: Date.now() });
    return result;
  }

  void attachPermissionListener();

  // 1. Check Permissions API for ground truth (cheap, no prompt).
  let permissionState: PermissionState | null = null;
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      permissionState = status.state;
    }
  } catch {
    // not supported — fall through
  }

  // 2. Reuse cache if it agrees with the current Permissions API state.
  const cached = readCache();
  if (cached) {
    const cacheImpliesGranted = cached.state === "granted";
    const cacheImpliesDenied = cached.state === "denied";
    const stillValid =
      permissionState === null ||
      (permissionState === "granted" && cacheImpliesGranted) ||
      (permissionState === "denied" && cacheImpliesDenied) ||
      (permissionState === "prompt" && false); // prompt always re-checks

    if (stillValid) {
      const fromCache = buildResultFromCache(cached);
      if (fromCache) return fromCache;
    } else {
      writeCache(null);
    }
  }

  // 3. If Permissions API says denied, short-circuit without prompting.
  if (permissionState === "denied") {
    const result: MicrophonePermissionResult = {
      ok: false,
      reason: "denied",
      title: "Microphone permission denied",
      description: "Enable microphone access in the app settings, then try the call again.",
      errorName: "PermissionDenied",
    };
    writeCache({ state: "denied", reason: "denied", errorName: "PermissionDenied", ts: Date.now() });
    return result;
  }

  // 4. Probe getUserMedia (will prompt on first use).
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stopStream(stream);
    writeCache({ state: "granted", ts: Date.now() });
    return { ok: true };
  } catch (err: any) {
    const name = err?.name || "UnknownError";
    const message = err?.message || "";
    if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
      writeCache({ state: "denied", reason: "denied", errorName: name, errorMessage: message, ts: Date.now() });
      return {
        ok: false,
        reason: "denied",
        title: "Microphone permission denied",
        description: "Enable microphone access in the app settings, then try the call again.",
        errorName: name,
        errorMessage: message,
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      writeCache({ state: "not_found", reason: "not_found", errorName: name, errorMessage: message, ts: Date.now() });
      return {
        ok: false,
        reason: "not_found",
        title: "No microphone found",
        description: "Connect or enable a microphone, then try again.",
        errorName: name,
        errorMessage: message,
      };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      // Don't cache — likely a transient device-busy state.
      return {
        ok: false,
        reason: "busy",
        title: "Microphone is busy",
        description: "Close other apps using the microphone, then try again.",
        errorName: name,
        errorMessage: message,
      };
    }
    return {
      ok: false,
      reason: "unknown",
      title: "Microphone check failed",
      description: message || "The microphone could not be opened on this device.",
      errorName: name,
      errorMessage: message,
    };
  }
};
