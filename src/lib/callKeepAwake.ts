// Keep the screen on for the duration of an active call.
//
// On the web we use the Screen Wake Lock API. On Capacitor Android we ALSO
// add FLAG_KEEP_SCREEN_ON to the Activity window via the AudioRouter plugin
// (which already runs during the call). Both are best-effort — we never
// throw, so callers can fire-and-forget.

let wakeLock: any = null;
let visibilityHandler: (() => void) | null = null;
let active = false;

const isAndroidNative = async (): Promise<boolean> => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor?.getPlatform?.() === "android" && Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

const requestWebWakeLock = async () => {
  try {
    const anyNav = navigator as any;
    if (anyNav?.wakeLock?.request) {
      wakeLock = await anyNav.wakeLock.request("screen");
      wakeLock?.addEventListener?.("release", () => {
        wakeLock = null;
      });
    }
  } catch (err) {
    console.warn("[call-keepawake] wakeLock request failed:", err);
  }
};

export const startCallKeepAwake = async (): Promise<void> => {
  if (active) return;
  active = true;

  // Web wake lock — and re-acquire on visibility change because the lock is
  // automatically released when the document is hidden.
  await requestWebWakeLock();
  visibilityHandler = () => {
    if (document.visibilityState === "visible" && active && !wakeLock) {
      void requestWebWakeLock();
    }
  };
  document.addEventListener("visibilitychange", visibilityHandler);

  // Android native — flip FLAG_KEEP_SCREEN_ON via the audio router plugin.
  if (await isAndroidNative()) {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const Plugin: any = registerPlugin("AudioRouter");
      await Plugin?.keepScreenOn?.({ on: true });
    } catch (err) {
      console.warn("[call-keepawake] native keepScreenOn failed:", err);
    }
  }
};

export const stopCallKeepAwake = async (): Promise<void> => {
  if (!active) return;
  active = false;

  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }

  try {
    await wakeLock?.release?.();
  } catch {
    /* ignore */
  }
  wakeLock = null;

  if (await isAndroidNative()) {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const Plugin: any = registerPlugin("AudioRouter");
      await Plugin?.keepScreenOn?.({ on: false });
    } catch {
      /* ignore */
    }
  }
};
