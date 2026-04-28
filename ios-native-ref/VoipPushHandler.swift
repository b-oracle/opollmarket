// ios/App/App/VoipPushHandler.swift
//
// Registers the PushKit VoIP token and converts incoming VoIP pushes into
// CallKit `reportNewIncomingCall` invocations.
//
// CRITICAL: iOS 13+ requires that EVERY VoIP push received results in a
// reportNewIncomingCall call within ~5 seconds, otherwise the OS terminates
// the app and may permanently disable VoIP delivery. Never silently drop a
// VoIP push — always report a call (and immediately end it if the data is
// invalid).

import Foundation
import PushKit
import CallKit
import Capacitor

final class VoipPushHandler: NSObject, PKPushRegistryDelegate {

    private let registry = PKPushRegistry(queue: .main)
    private let callProvider: CallProviderDelegate

    init(callProvider: CallProviderDelegate) {
        self.callProvider = callProvider
    }

    func register() {
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
    }

    // ── Token lifecycle ───────────────────────────────────────────────────
    func pushRegistry(_ registry: PKPushRegistry,
                      didUpdate pushCredentials: PKPushCredentials,
                      for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        NSLog("[VoIP] Got PushKit token: …\(token.suffix(12))")

        // Forward to the JS layer which already knows how to POST to
        // register-fcm-token with the user's session. We pass token_type=voip
        // so the server stores it on its own row.
        DispatchQueue.main.async {
            CAPBridge.notifyListeners(
                "voipTokenRegistered",
                data: [
                    "token": token,
                    "platform": "ios",
                    "token_type": "voip"
                ]
            )
        }
    }

    func pushRegistry(_ registry: PKPushRegistry,
                      didInvalidatePushTokenFor type: PKPushType) {
        NSLog("[VoIP] Token invalidated")
        CAPBridge.notifyListeners("voipTokenInvalidated", data: [:])
    }

    // ── Incoming push ─────────────────────────────────────────────────────
    func pushRegistry(_ registry: PKPushRegistry,
                      didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType,
                      completion: @escaping () -> Void) {

        guard type == .voIP else { completion(); return }

        let dict = payload.dictionaryPayload
        let callId          = (dict["call_id"] as? String) ?? UUID().uuidString
        let callerName      = (dict["caller_name"] as? String) ?? "Incoming call"
        let callerId        = (dict["caller_id"] as? String) ?? ""
        let conversationId  = (dict["conversation_id"] as? String) ?? ""
        let hasVideo        = (dict["has_video"] as? Bool) ?? false

        callProvider.reportIncomingCall(
            callId: callId,
            callerName: callerName,
            callerId: callerId,
            conversationId: conversationId,
            hasVideo: hasVideo,
            completion: { _ in completion() }
        )
    }
}
