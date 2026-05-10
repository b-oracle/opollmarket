// ios-native-ref/AudioRouterPlugin.swift
//
// iOS counterpart to android-native-ref/AudioRouterPlugin.kt.
//
// Mirrors the Android plugin surface so the JS layer (src/lib/callKeepAwake.ts
// and src/lib/audioRouter.ts) can call the same plugin name "AudioRouter" on
// both platforms. The only method strictly required for the WhatsApp-style
// persistent in-call UI is `keepScreenOn` — it disables the iOS idle timer
// for the duration of the call so the lock screen doesn't kick in mid-call,
// matching FLAG_KEEP_SCREEN_ON on Android.
//
// INSTALL
// -------
// 1. Drop this file into `ios/App/App/` next to AppDelegate.swift.
// 2. In your AppDelegate (or a bridge file) register the plugin once at
//    launch — Capacitor 5+ auto-discovers @objc(...) Plugin subclasses, but
//    if you're on a customized template add:
//
//        // in AppDelegate.application(_:didFinishLaunchingWithOptions:)
//        // CAPBridge.registerPlugin(AudioRouterPlugin.self)
//
// 3. Rebuild: `npx cap sync ios && npx cap run ios`.
//
// The JS side already calls:
//   const Plugin: any = registerPlugin("AudioRouter");
//   await Plugin.keepScreenOn({ on: true });
// so no JS changes are needed beyond what callKeepAwake.ts already does.

import Foundation
import Capacitor
import AVFoundation
import UIKit

@objc(AudioRouterPlugin)
public class AudioRouterPlugin: CAPPlugin {

    /// Toggle `UIApplication.shared.isIdleTimerDisabled`. Called from JS while
    /// the call overlay is mounted so the screen never auto-locks during an
    /// active call. Mirrors FLAG_KEEP_SCREEN_ON on Android.
    @objc func keepScreenOn(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
        }
        call.resolve(["on": on])
    }

    /// Best-effort speakerphone toggle so the existing AudioRouter JS API
    /// doesn't reject on iOS. The real audio routing is handled by
    /// CallProviderDelegate via CallKit; this is just a fallback for cases
    /// where CallKit isn't active (e.g. the call was answered through the
    /// in-app banner instead of the system UI).
    @objc func setSpeakerphoneOn(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord,
                                    mode: .voiceChat,
                                    options: on ? [.defaultToSpeaker, .allowBluetooth]
                                                : [.allowBluetooth])
            try session.overrideOutputAudioPort(on ? .speaker : .none)
            try session.setActive(true, options: [])
            call.resolve(["on": on])
        } catch {
            call.reject("Audio session error: \(error.localizedDescription)")
        }
    }

    /// No-op stubs so cross-platform JS can call without `if (android)` guards.
    @objc func startCall(_ call: CAPPluginCall)  { call.resolve() }
    @objc func endCall(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        call.resolve()
    }
}
