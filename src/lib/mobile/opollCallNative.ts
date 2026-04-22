import { Capacitor } from "@capacitor/core";

let initialized = false;

export const initOpollCallNative = async () => {
  if (initialized) return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  initialized = true;

  try {
    const { OpollCall } = await import("opoll-call-plugin");

    await OpollCall.addListener("incomingCall", (payload) => {
      window.dispatchEvent(new CustomEvent("native-incoming-call", { detail: payload }));
    });

    await OpollCall.addListener("callAction", (payload) => {
      window.dispatchEvent(new CustomEvent("native-call-action", { detail: payload }));
    });

    const pending = await OpollCall.getPendingAction();
    if (pending?.action) {
      window.dispatchEvent(new CustomEvent("native-call-action", { detail: pending }));
    }

    const permission = await OpollCall.requestNotificationPermission();
    if (!permission.granted) return;

    const token = await OpollCall.getFcmToken();
    if (token?.token) {
      window.dispatchEvent(new CustomEvent("native-fcm-token", { detail: token }));
    }
  } catch (err) {
    console.warn("Native call plugin init failed", err);
  }
};
