// CallKit ↔ overlay bridge
//
// Thin JS wrapper around the iOS-only `CallKitBridge` Capacitor plugin
// (ios-native-ref/CallKitBridgePlugin.swift). On Android / web every method
// is a safe no-op so the overlay can call these unconditionally.
//
// Two directions:
//   • System → JS: subscribe to "callMuted" / "callEnded" / "callRouteChanged"
//     events so the in-app overlay updates state when the user taps
//     mute/hangup/speaker on the native CallKit screen.
//   • JS → System: when the user toggles mute or hangs up FROM the overlay,
//     push the change back into CallKit so the system UI mirrors it.

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

interface CallKitBridgePlugin {
  setMuted(opts: { callId: string; on: boolean }): Promise<{ on: boolean }>;
  endCall(opts: { callId: string }): Promise<void>;
  addListener(
    eventName: "callMuted",
    handler: (e: { callId: string; muted: boolean }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "callEnded" | "callDeclined" | "callAccepted",
    handler: (e: { callId: string; conversationId?: string; callerId?: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "callRouteChanged",
    handler: (e: { speakerOn: boolean; bluetooth: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<CallKitBridgePlugin>("CallKitBridge");

const isIOSNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
};

export const CallKitBridge = {
  isAvailable: isIOSNative,

  /** Push the overlay's mute state into CallKit. */
  async setMuted(callId: string, on: boolean): Promise<void> {
    if (!isIOSNative()) return;
    try {
      await Native.setMuted({ callId, on });
    } catch (err) {
      console.warn("[callkit-bridge] setMuted failed:", err);
    }
  },

  /** Hang up from the overlay — also dismisses the CallKit screen. */
  async endCall(callId: string): Promise<void> {
    if (!isIOSNative()) return;
    try {
      await Native.endCall({ callId });
    } catch (err) {
      console.warn("[callkit-bridge] endCall failed:", err);
    }
  },

  /** Subscribe; returns an unsubscribe function. No-op on non-iOS. */
  onMuted(
    handler: (e: { callId: string; muted: boolean }) => void,
  ): () => void {
    if (!isIOSNative()) return () => {};
    let h: PluginListenerHandle | undefined;
    Native.addListener("callMuted", handler).then((handle) => { h = handle; }).catch(() => {});
    return () => { try { h?.remove(); } catch {} };
  },

  onEnded(
    handler: (e: { callId: string }) => void,
  ): () => void {
    if (!isIOSNative()) return () => {};
    let h: PluginListenerHandle | undefined;
    Native.addListener("callEnded", handler).then((handle) => { h = handle; }).catch(() => {});
    return () => { try { h?.remove(); } catch {} };
  },

  onRouteChanged(
    handler: (e: { speakerOn: boolean; bluetooth: boolean }) => void,
  ): () => void {
    if (!isIOSNative()) return () => {};
    let h: PluginListenerHandle | undefined;
    Native.addListener("callRouteChanged", handler).then((handle) => { h = handle; }).catch(() => {});
    return () => { try { h?.remove(); } catch {} };
  },
};
