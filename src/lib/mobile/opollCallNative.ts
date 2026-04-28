import { Capacitor } from "@capacitor/core";

let initialized = false;
const PENDING_NATIVE_INCOMING_KEY = "opoll-pending-native-incoming";
const PENDING_NATIVE_ACTION_KEY = "opoll-pending-native-action";
type OpollCallLike = {
  addListener: (
    eventName: "incomingCall" | "callAction",
    listener: (payload: Record<string, unknown>) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
  getPendingAction: () => Promise<Record<string, unknown>>;
  requestNotificationPermission: () => Promise<{ granted: boolean }>;
  getFcmToken: () => Promise<{ token?: string }>;
};

const storePending = (key: string, payload: unknown) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
};

export const initOpollCallNative = async () => {
  if (initialized) return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  initialized = true;

  try {
    const opollModule = (await import("opoll-call-plugin")) as { OpollCall: OpollCallLike };
    const OpollCall = opollModule.OpollCall;

    await OpollCall.addListener("incomingCall", (payload) => {
      storePending(PENDING_NATIVE_INCOMING_KEY, payload);
      window.dispatchEvent(new CustomEvent("native-incoming-call", { detail: payload }));
    });

    await OpollCall.addListener("callAction", (payload) => {
      storePending(PENDING_NATIVE_ACTION_KEY, payload);
      window.dispatchEvent(new CustomEvent("native-call-action", { detail: payload }));
    });

    const pending = await OpollCall.getPendingAction();
    if (pending?.action) {
      storePending(PENDING_NATIVE_ACTION_KEY, pending);
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
