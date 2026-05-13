/**
 * Unified haptic & vibration helper.
 * Works across:
 *   1. Capacitor native (Android/iOS) — uses @capacitor/haptics
 *   2. Web / PWA — uses navigator.vibrate fallback
 *
 * Safe no-op when none are available.
 */
import { Capacitor } from "@capacitor/core";

const isCapacitorNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const webVibrate = (pattern: number | number[]): void => {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
  }
};

// ── Impact haptics ───────────────────────────────────────────────

export const hapticLight = async (): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate(10);
};

export const hapticMedium = async (): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate(25);
};

export const hapticHeavy = async (): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Heavy });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate(50);
};

// ── Notification haptics ─────────────────────────────────────────

export const hapticSuccess = async (): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Success });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate([15, 50, 15]);
};

export const hapticWarning = async (): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate([20, 40, 20]);
};

export const hapticError = async (): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Error });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate([30, 60, 30, 60, 30]);
};

// ── Selection / tick (used for sliders, scrubbing) ───────────────

export const hapticSelection = async (): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics } = await import("@capacitor/haptics");
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
      return;
    } catch {
      // fall through
    }
  }
  webVibrate(5);
};

// ── Raw vibration (for incoming-call ring, alerts) ───────────────

// Tracks the active pattern timer so stopVibration() can cancel it.
let activePatternTimer: ReturnType<typeof setTimeout> | null = null;
const clearActivePattern = () => {
  if (activePatternTimer) {
    clearTimeout(activePatternTimer);
    activePatternTimer = null;
  }
};

/**
 * Vibrate with a custom pattern (ms). Use for ringtone-style buzzing.
 *
 * Pattern semantics (matches navigator.vibrate):
 *   [vibrateMs, pauseMs, vibrateMs, pauseMs, …]
 *
 * On Capacitor we honor the on/off rhythm by chaining `Haptics.vibrate`
 * calls with timed gaps (the plugin only takes a single duration per call).
 * On web we delegate to navigator.vibrate which understands the array.
 */
export const vibrate = async (pattern: number | number[] = 200): Promise<void> => {
  clearActivePattern();
  const arr = Array.isArray(pattern) ? pattern : [pattern];

  if (isCapacitorNative()) {
    try {
      const { Haptics } = await import("@capacitor/haptics");
      // Walk the pattern: even indices = vibrate, odd indices = pause.
      let offset = 0;
      const runStep = (idx: number) => {
        if (idx >= arr.length) return;
        const ms = Math.max(0, Math.floor(arr[idx]));
        if (idx % 2 === 0 && ms > 0) {
          // vibrate slot
          Haptics.vibrate({ duration: ms }).catch(() => {});
        }
        if (idx + 1 < arr.length) {
          activePatternTimer = setTimeout(() => runStep(idx + 1), ms);
        }
      };
      runStep(0);
      return;
    } catch {
      // fall through to web vibrate
    }
  }
  webVibrate(pattern);
};

/**
 * Stop any ongoing vibration / pattern.
 */
export const stopVibration = (): void => {
  clearActivePattern();
  webVibrate(0);
};

// ── Pre-built call vibration patterns ────────────────────────────

/**
 * Initial attention buzz when the call banner first appears.
 * Two firm taps so the user notices instantly.
 */
export const CALL_ATTENTION_PATTERN: number[] = [120, 80, 120];

/**
 * WhatsApp-style ringing cadence — long buzz, short pause, long buzz,
 * longer silence. Looped while the banner is showing.
 *   buzz 1000ms · pause 500ms · buzz 1000ms · pause 1500ms
 */
export const CALL_RING_PATTERN: number[] = [1000, 500, 1000, 1500];

/**
 * Total cycle length (ms) for CALL_RING_PATTERN — used as the loop interval.
 */
export const CALL_RING_PATTERN_DURATION =
  CALL_RING_PATTERN.reduce((a, b) => a + b, 0);

/**
 * Soft buzz when a call is answered/connected.
 */
export const CALL_CONNECTED_PATTERN: number[] = [40, 60, 40];

/**
 * Decisive buzz when a call ends or is declined.
 */
export const CALL_ENDED_PATTERN: number[] = [200];

/**
 * Start the looping incoming-call vibration. Returns a cancel function
 * that stops the loop and any in-flight vibration.
 *
 * Sequence:
 *   1. Initial CALL_ATTENTION_PATTERN to get attention.
 *   2. Then loops CALL_RING_PATTERN every CALL_RING_PATTERN_DURATION ms.
 */
export const startIncomingCallVibration = (): (() => void) => {
  let cancelled = false;
  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let impactTimer: ReturnType<typeof setInterval> | null = null;

  // Self-rescheduling loop — each cycle re-arms the next one only after the
  // current pattern duration elapses. Avoids drift and ensures we keep
  // buzzing for as long as the banner is visible (some browsers cancel the
  // previous vibrate when a new one is issued, so we always re-issue).
  const cycleMs = CALL_RING_PATTERN.reduce((a, b) => a + b, 0);
  const tick = () => {
    if (cancelled) return;
    void vibrate(CALL_RING_PATTERN);
    loopTimer = setTimeout(tick, cycleMs);
  };

  // Kick off with the attention buzz, then start the ringing loop.
  void vibrate(CALL_ATTENTION_PATTERN);
  const attentionMs = CALL_ATTENTION_PATTERN.reduce((a, b) => a + b, 0);
  loopTimer = setTimeout(tick, attentionMs + 80);

  // iOS Safari has no navigator.vibrate, and on iOS Capacitor the Haptics
  // plugin maps vibrate() to a tiny tap. To make the device actually pulse
  // continuously, fire a heavy haptic impact ~every 700ms in parallel. On
  // Android this stacks with the real vibration; on iOS native it becomes
  // the primary ring feedback.
  if (isCapacitorNative()) {
    impactTimer = setInterval(() => {
      if (cancelled) return;
      void hapticHeavy();
    }, 700);
  }

  return () => {
    cancelled = true;
    if (loopTimer) clearTimeout(loopTimer);
    if (impactTimer) clearInterval(impactTimer);
    stopVibration();
  };
};

