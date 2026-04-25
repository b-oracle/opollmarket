/**
 * Unified haptic & vibration helper.
 * Works across:
 *   1. Capacitor native (Android/iOS) — uses @capacitor/haptics
 *   2. Despia native wrapper — uses despia:// URLs
 *   3. Web / PWA — uses navigator.vibrate fallback
 *
 * Safe no-op when none are available.
 */
import { Capacitor } from "@capacitor/core";
import {
  hapticLight as despiaLight,
  hapticSuccess as despiaSuccess,
  hapticWarning as despiaWarning,
  hapticError as despiaError,
  hapticHeavy as despiaHeavy,
  isDespiaNative,
} from "./despia";
import { getHapticsEnabled, getVibrationEnabled } from "@/hooks/useDevicePrefs";

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
  if (!getHapticsEnabled()) return;
  if (isCapacitorNative()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    } catch {
      // fall through
    }
  }
  if (isDespiaNative()) {
    despiaLight();
    return;
  }
  webVibrate(10);
};

export const hapticMedium = async (): Promise<void> => {
  if (!getHapticsEnabled()) return;
  if (isCapacitorNative()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Medium });
      return;
    } catch {
      // fall through
    }
  }
  if (isDespiaNative()) {
    despiaLight();
    return;
  }
  webVibrate(25);
};

export const hapticHeavy = async (): Promise<void> => {
  if (!getHapticsEnabled()) return;
  if (isCapacitorNative()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ImpactStyle.Heavy });
      return;
    } catch {
      // fall through
    }
  }
  if (isDespiaNative()) {
    despiaHeavy();
    return;
  }
  webVibrate(50);
};

// ── Notification haptics ─────────────────────────────────────────

export const hapticSuccess = async (): Promise<void> => {
  if (!getHapticsEnabled()) return;
  if (isCapacitorNative()) {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Success });
      return;
    } catch {
      // fall through
    }
  }
  if (isDespiaNative()) {
    despiaSuccess();
    return;
  }
  webVibrate([15, 50, 15]);
};

export const hapticWarning = async (): Promise<void> => {
  if (!getHapticsEnabled()) return;
  if (isCapacitorNative()) {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    } catch {
      // fall through
    }
  }
  if (isDespiaNative()) {
    despiaWarning();
    return;
  }
  webVibrate([20, 40, 20]);
};

export const hapticError = async (): Promise<void> => {
  if (!getHapticsEnabled()) return;
  if (isCapacitorNative()) {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Error });
      return;
    } catch {
      // fall through
    }
  }
  if (isDespiaNative()) {
    despiaError();
    return;
  }
  webVibrate([30, 60, 30, 60, 30]);
};

// ── Selection / tick (used for sliders, scrubbing) ───────────────

export const hapticSelection = async (): Promise<void> => {
  if (!getHapticsEnabled()) return;
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

/**
 * Vibrate with a custom pattern (ms). Use for ringtone-style buzzing.
 * On Capacitor uses Haptics.vibrate; on web uses navigator.vibrate.
 */
export const vibrate = async (pattern: number | number[] = 200): Promise<void> => {
  if (isCapacitorNative()) {
    try {
      const { Haptics } = await import("@capacitor/haptics");
      const duration = Array.isArray(pattern)
        ? pattern.reduce((a, b) => a + b, 0)
        : pattern;
      await Haptics.vibrate({ duration });
      return;
    } catch {
      // fall through
    }
  }
  webVibrate(pattern);
};

/**
 * Stop any ongoing vibration.
 */
export const stopVibration = (): void => {
  webVibrate(0);
};
