import { useCallback, useEffect, useState } from "react";

/**
 * Per-device user preferences for tactile + alert behavior.
 *
 * Stored in localStorage so they persist across sessions but stay device-local
 * (a user's phone can be silent while their tablet still buzzes). Other modules
 * (haptics utility, notification fallback) read these flags via the helpers
 * below to decide whether to fire a buzz / show a system notification.
 */

export interface DevicePrefs {
  /** Master switch for tactile feedback (impacts, success/error pulses, ticks). */
  hapticsEnabled: boolean;
  /** Master switch for raw vibration patterns (incoming-call ring, alerts). */
  vibrationEnabled: boolean;
  /** When false, suppresses the foreground local-notification fallback. */
  pushFallbackEnabled: boolean;
}

const STORAGE_KEY = "device-prefs:v1";

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  hapticsEnabled: true,
  vibrationEnabled: true,
  pushFallbackEnabled: true,
};

const readPrefs = (): DevicePrefs => {
  if (typeof window === "undefined") return DEFAULT_DEVICE_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DEVICE_PREFS;
    const parsed = JSON.parse(raw) as Partial<DevicePrefs>;
    return { ...DEFAULT_DEVICE_PREFS, ...parsed };
  } catch {
    return DEFAULT_DEVICE_PREFS;
  }
};

const writePrefs = (prefs: DevicePrefs) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("device-prefs:changed", { detail: prefs }));
  } catch {
    // ignore quota / private mode
  }
};

// Synchronous getters so non-React modules (haptics, notification fallback) can
// consult prefs without subscribing to React state.
export const getHapticsEnabled = (): boolean => readPrefs().hapticsEnabled;
export const getVibrationEnabled = (): boolean => readPrefs().vibrationEnabled;
export const getPushFallbackEnabled = (): boolean => readPrefs().pushFallbackEnabled;

export const useDevicePrefs = () => {
  const [prefs, setPrefs] = useState<DevicePrefs>(() => readPrefs());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<DevicePrefs>).detail;
      if (detail) setPrefs(detail);
      else setPrefs(readPrefs());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(readPrefs());
    };
    window.addEventListener("device-prefs:changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("device-prefs:changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((partial: Partial<DevicePrefs>) => {
    const next = { ...readPrefs(), ...partial };
    writePrefs(next);
    setPrefs(next);
  }, []);

  return { prefs, update };
};
