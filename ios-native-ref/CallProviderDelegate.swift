// ios/App/App/CallProviderDelegate.swift
//
// CallKit provider that owns the native green/red incoming-call UI AND keeps
// system call state (mute, audio route, hangup) in sync with the Capacitor
// webview so the in-app full-screen overlay always matches what the user
// pressed in the system UI — and vice-versa.
//
// Events emitted to JS via CAPBridge.notifyListeners:
//   • "callAccepted"      { callId, conversationId, callerId }
//   • "callDeclined"      { callId, conversationId, callerId }       (rejected while ringing)
//   • "callEnded"         { callId }                                  (hangup after answer)
//   • "callMuted"         { callId, muted: Bool }                     (system mute toggle)
//   • "callRouteChanged"  { speakerOn: Bool, bluetooth: Bool }        (output route changed)
//
// Methods JS can call back into (via CallKitBridgePlugin):
//   • requestSetMuted(callId, muted)  → drives CXSetMutedCallAction so the
//                                        system UI mute pill reflects the
//                                        overlay state.
//   • requestEndCall(callId)          → drives CXEndCallAction so killing the
//                                        call from the overlay also dismisses
//                                        the CallKit screen.

import Foundation
import CallKit
import AVFoundation
import Capacitor

final class CallProviderDelegate: NSObject, CXProviderDelegate {

    /// Shared singleton so the Capacitor plugin (CallKitBridgePlugin) and
    /// VoipPushHandler can both reach the same CXProvider/CXCallController.
    static let shared = CallProviderDelegate()

    private let provider: CXProvider
    private let callController = CXCallController()

    /// callId → (conversationId, callerId) — needed when the user accepts so
    /// we can route the webview to the right thread.
    private var pendingMeta: [UUID: (conversationId: String, callerId: String)] = [:]
    /// Calls that have been answered — used to distinguish a "decline" tap
    /// (while ringing) from a "hangup" tap (after answer).
    private var answeredCalls: Set<UUID> = []

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

        // Forward audio-route changes (speaker / earpiece / Bluetooth) to JS so
        // the overlay's speaker toggle stays in sync with the system audio
        // route picker that lives inside the CallKit screen.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    // ── Public API used by VoipPushHandler ───────────────────────────────
    func reportIncomingCall(callId: String,
                            callerName: String,
                            callerId: String,
                            conversationId: String,
                            hasVideo: Bool,
                            completion: @escaping (Error?) -> Void) {

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

    // ── Public API used by CallKitBridgePlugin (overlay → system) ────────
    /// Push the overlay's mute state into CallKit so the system UI mute
    /// indicator matches what the user just tapped in the overlay.
    func requestSetMuted(callIdString: String, muted: Bool) {
        guard let uuid = UUID(uuidString: callIdString) else { return }
        let action = CXSetMutedCallAction(call: uuid, muted: muted)
        callController.requestTransaction(with: action) { err in
            if let err = err {
                NSLog("[CallKit] requestSetMuted failed: \(err.localizedDescription)")
            }
        }
    }

    /// End a call from the overlay — dismisses the CallKit screen and frees
    /// the audio session.
    func requestEndCall(callIdString: String) {
        guard let uuid = UUID(uuidString: callIdString) else { return }
        let action = CXEndCallAction(call: uuid)
        callController.requestTransaction(with: action) { err in
            if let err = err {
                NSLog("[CallKit] requestEndCall failed: \(err.localizedDescription)")
            }
        }
    }

    // ── CXProviderDelegate ───────────────────────────────────────────────
    func providerDidReset(_ provider: CXProvider) {
        pendingMeta.removeAll()
        answeredCalls.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let meta = pendingMeta[action.callUUID]
        answeredCalls.insert(action.callUUID)
        let payload: [String: Any] = [
            "callId": action.callUUID.uuidString.lowercased(),
            "conversationId": meta?.conversationId ?? "",
            "callerId": meta?.callerId ?? ""
        ]
        configureAudioSession()
        DispatchQueue.main.async {
            CallKitBridgePlugin.emit("callAccepted", payload)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let uuid = action.callUUID
        let wasAnswered = answeredCalls.remove(uuid) != nil
        let meta = pendingMeta.removeValue(forKey: uuid)
        let event = wasAnswered ? "callEnded" : "callDeclined"
        DispatchQueue.main.async {
            CAPBridge.notifyListeners(event, data: [
                "callId": uuid.uuidString.lowercased(),
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

    // ── Audio route observer ─────────────────────────────────────────────
    @objc private func handleRouteChange(_ notification: Notification) {
        let session = AVAudioSession.sharedInstance()
        let route = session.currentRoute
        let outputs = route.outputs.map { $0.portType }
        let speakerOn = outputs.contains(.builtInSpeaker)
        let bluetoothOn = outputs.contains(where: {
            $0 == .bluetoothA2DP || $0 == .bluetoothHFP || $0 == .bluetoothLE
        })
        DispatchQueue.main.async {
            CAPBridge.notifyListeners("callRouteChanged", data: [
                "speakerOn": speakerOn,
                "bluetooth": bluetoothOn
            ])
        }
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
