// ios/App/App/CallKitBridgePlugin.swift
//
// Capacitor plugin that lets the JS layer (the full-screen call overlay) push
// state INTO CallKit so the system UI stays in sync with what the user does
// inside the app:
//
//   • CallKitBridge.setMuted({ callId, on })  → CXSetMutedCallAction
//   • CallKitBridge.endCall({ callId })       → CXEndCallAction
//
// The reverse direction (system → JS) is handled by CallProviderDelegate via
// CAPBridge.notifyListeners ("callMuted", "callEnded", "callRouteChanged",
// "callAccepted", "callDeclined"). Listen to those from the JS side via:
//
//   const Plugin = registerPlugin("CallKitBridge");
//   Plugin.addListener("callMuted", ({ callId, muted }) => { … });
//
// INSTALL
// -------
// 1. Drop this file into ios/App/App/ alongside CallProviderDelegate.swift.
// 2. Capacitor 5+ auto-discovers @objc(...) plugin classes; if your template
//    is custom, register manually in AppDelegate:
//        // CAPBridge.registerPlugin(CallKitBridgePlugin.self)
// 3. Make sure CallProviderDelegate.shared is the SAME instance used by
//    VoipPushHandler (we already converted it to a singleton).

import Foundation
import Capacitor

@objc(CallKitBridgePlugin)
public class CallKitBridgePlugin: CAPPlugin {

    @objc func setMuted(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else {
            call.reject("callId is required")
            return
        }
        let on = call.getBool("on") ?? false
        CallProviderDelegate.shared.requestSetMuted(callIdString: callId, muted: on)
        call.resolve(["on": on])
    }

    @objc func endCall(_ call: CAPPluginCall) {
        guard let callId = call.getString("callId") else {
            call.reject("callId is required")
            return
        }
        CallProviderDelegate.shared.requestEndCall(callIdString: callId)
        call.resolve()
    }

    /// Listener registration is automatic via CAPPlugin — JS just calls
    /// `Plugin.addListener("callMuted" | "callEnded" | "callRouteChanged" |
    /// "callAccepted" | "callDeclined", handler)`. CAPBridge.notifyListeners
    /// in CallProviderDelegate fans the events out to every registered
    /// plugin, including this one.
}
