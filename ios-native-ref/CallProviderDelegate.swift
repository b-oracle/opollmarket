// ios/App/App/CallProviderDelegate.swift
//
// CallKit provider that owns the native green/red incoming-call UI.
// Handles Accept / Decline taps and forwards them to the Capacitor webview.

import Foundation
import CallKit
import AVFoundation
import Capacitor

final class CallProviderDelegate: NSObject, CXProviderDelegate {

    private let provider: CXProvider
    private let callController = CXCallController()

    /// callId → (conversationId, callerId) — needed when the user accepts so
    /// we can route the webview to the right thread.
    private var pendingMeta: [UUID: (conversationId: String, callerId: String)] = [:]

    override init() {
        let config = CXProviderConfiguration(localizedName: "Opoll")
        config.supportsVideo = true
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        if let img = UIImage(named: "AppIcon") {
            config.iconTemplateImageData = img.pngData()
        }
        config.ringtoneSound = "ringtone.caf"
        config.includesCallsInRecents = true
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    // ── Public API used by VoipPushHandler ───────────────────────────────
    func reportIncomingCall(callId: String,
                            callerName: String,
                            callerId: String,
                            conversationId: String,
                            hasVideo: Bool,
                            completion: @escaping (Error?) -> Void) {

        // CallKit identifies calls by UUID. We map our string call_id into a
        // deterministic UUID so DTMF / mute / endCall actions round-trip.
        let uuid = UUID(uuidString: callId) ?? UUID()
        pendingMeta[uuid] = (conversationId, callerId)

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = hasVideo
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false

        provider.reportNewIncomingCall(with: uuid, update: update) { err in
            if let err = err {
                NSLog("[CallKit] reportNewIncomingCall failed: \(err.localizedDescription)")
            }
            completion(err)
        }
    }

    // ── CXProviderDelegate ───────────────────────────────────────────────
    func providerDidReset(_ provider: CXProvider) {
        pendingMeta.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let meta = pendingMeta[action.callUUID]
        let payload: [String: Any] = [
            "callId": action.callUUID.uuidString.lowercased(),
            "conversationId": meta?.conversationId ?? "",
            "callerId": meta?.callerId ?? ""
        ]
        // Configure the audio session BEFORE fulfilling — required by CallKit.
        configureAudioSession()
        DispatchQueue.main.async {
            CAPBridge.notifyListeners("callAccepted", data: payload)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let meta = pendingMeta.removeValue(forKey: action.callUUID)
        DispatchQueue.main.async {
            CAPBridge.notifyListeners("callDeclined", data: [
                "callId": action.callUUID.uuidString.lowercased(),
                "conversationId": meta?.conversationId ?? "",
                "callerId": meta?.callerId ?? ""
            ])
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        DispatchQueue.main.async {
            CAPBridge.notifyListeners("callMuted", data: [
                "callId": action.callUUID.uuidString.lowercased(),
                "muted": action.isMuted
            ])
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // LiveKit will pick up the active audio session here.
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        // LiveKit cleanup happens in the JS layer when callDeclined/callEnded fires.
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord,
                                    mode: .voiceChat,
                                    options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true, options: [])
        } catch {
            NSLog("[CallKit] AudioSession config failed: \(error.localizedDescription)")
        }
    }
}
