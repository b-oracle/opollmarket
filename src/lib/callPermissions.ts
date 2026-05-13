// Call permissions helper — checks/requests every toggle that swipe-to-answer
// on Android 14+ requires:
//   1. POST_NOTIFICATIONS  (API 33+, runtime prompt)
//   2. USE_FULL_SCREEN_INTENT  (API 34+, per-app Settings toggle)
//   3. Battery optimization exemption  (helps FCM data push wake the app)
//   4. Notification channel importance for "incoming_calls"  (informational)
//
// Backed by the native CallPermissions Capacitor plugin (see
// android-native-ref/MainActivity.additions.kt). Web/iOS: returns granted=true
// for native-only checks so the onboarding modal stays out of the way.

import { Capacitor, registerPlugin } from "@capacitor/core";

export type PermissionStatus = "granted" | "denied" | "unsupported";

export interface CallPermissionsState {
  notifications: PermissionStatus;
  fullScreenIntent: PermissionStatus;
  batteryOptimization: PermissionStatus; // "granted" = exempt
  channelImportance: PermissionStatus;   // "granted" = HIGH/MAX
  sdkInt: number;
  isAndroid: boolean;
}

interface NativeCallPermissions {
  check(): Promise<CallPermissionsState>;
  requestNotifications(): Promise<{ status: PermissionStatus }>;
  openFullScreenIntentSettings(): Promise<void>;
  openBatteryOptimizationSettings(): Promise<void>;
  openChannelSettings(): Promise<void>;
}

const Plugin = registerPlugin<NativeCallPermissions>("CallPermissions");
// Legacy plugin for backward-compat with existing FsiPermissionBanner CTA.
const FsiPermission = registerPlugin<{ openSettings: () => Promise<void> }>("FsiPermission");

const isAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

const allGranted = (): CallPermissionsState => ({
  notifications: "granted",
  fullScreenIntent: "granted",
  batteryOptimization: "granted",
  channelImportance: "granted",
  sdkInt: 0,
  isAndroid: false,
});

export async function checkCallPermissions(): Promise<CallPermissionsState> {
  if (!isAndroid()) return allGranted();
  try {
    return await Plugin.check();
  } catch (err) {
    console.warn("[callPermissions] native check failed:", err);
    return allGranted();
  }
}

export async function requestNotificationsPermission(): Promise<PermissionStatus> {
  if (!isAndroid()) return "granted";
  try {
    const { status } = await Plugin.requestNotifications();
    return status;
  } catch {
    // Fallback to LocalNotifications plugin if native plugin isn't installed yet.
    try {
      const mod = await import("@capacitor/local-notifications");
      const res = await mod.LocalNotifications.requestPermissions();
      return res.display === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
}

export async function openFullScreenIntentSettings(): Promise<void> {
  if (!isAndroid()) return;
  try {
    await Plugin.openFullScreenIntentSettings();
  } catch {
    try { await FsiPermission.openSettings(); } catch { /* noop */ }
  }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  if (!isAndroid()) return;
  try { await Plugin.openBatteryOptimizationSettings(); } catch { /* noop */ }
}

export async function openChannelSettings(): Promise<void> {
  if (!isAndroid()) return;
  try { await Plugin.openChannelSettings(); } catch { /* noop */ }
}

export const isNativeAndroid = isAndroid;
