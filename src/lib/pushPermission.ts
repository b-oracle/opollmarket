/**
 * Helpers for inspecting and requesting native push-notification permission
 * from UI surfaces (Settings screen, prompts).
 *
 * Returns 'unsupported' on web/PWA where Capacitor isn't available.
 */

export type PushPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "prompt-with-rationale"
  | "unsupported";

const isCapacitorNative = async (): Promise<boolean> => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const getPushPermission = async (): Promise<PushPermissionState> => {
  if (!(await isCapacitorNative())) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const result = await PushNotifications.checkPermissions();
    return (result.receive as PushPermissionState) ?? "prompt";
  } catch {
    return "unsupported";
  }
};

export const requestPushPermission = async (): Promise<PushPermissionState> => {
  if (!(await isCapacitorNative())) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const result = await PushNotifications.requestPermissions();
    if (result.receive === "granted") {
      try {
        await PushNotifications.register();
      } catch {
        // ignore — token will still arrive on next registration cycle
      }
    }
    return (result.receive as PushPermissionState) ?? "denied";
  } catch {
    return "unsupported";
  }
};
