---
name: iOS Call Notifications Stack
description: PushKit + CallKit native lockscreen call UI on iOS, paired with direct APNs VoIP delivery from send-fcm-push.
type: feature
---
iOS uses **PushKit + CallKit** for the WhatsApp-style native green/red full-screen incoming-call UI on the lockscreen, mirroring the Android `IncomingCallActivity` flow.

**Token model** (`user_fcm_tokens.token_type`):
- `standard` — APNs alert token from `UIApplication.registerForRemoteNotifications()`. Used for missed-call alerts and generic notifications via FCM.
- `voip` — PushKit token from `PKPushRegistry`. Used **only** for incoming-call wake-ups.

**Server delivery** (`supabase/functions/send-fcm-push`):
- All APNs branches send `apns-topic` explicitly (defaults to `com.opollmarket.app`, override with `APNS_BUNDLE_ID` secret).
- For rows where `is_call=true && platform='ios' && token_type='voip'`, the function bypasses FCM and POSTs directly to `https://api.push.apple.com/3/device/<token>` with `apns-push-type: voip` and topic `<bundle>.voip`. JWT (ES256) is signed with `APNS_AUTH_KEY_P8` / `APNS_KEY_ID` / `APNS_TEAM_ID` secrets and cached for 50 minutes.
- Set `APNS_USE_SANDBOX=1` only for Debug builds against `api.sandbox.push.apple.com`.
- Without VoIP secrets the function still works for Android and standard iOS alert pushes — VoIP rows just fail with `MissingApnsCredentials`.

**Native reference** lives in `ios-native-ref/` (mirrors `android-native-ref/`):
- `AppDelegate.swift.additions.swift` — bootstrap PushKit + CallKit at launch.
- `VoipPushHandler.swift` — `PKPushRegistryDelegate`; MUST call `reportNewIncomingCall` within ~5 s of every VoIP push or iOS disables VoIP for the app.
- `CallProviderDelegate.swift` — `CXProviderDelegate`; bridges Accept/Decline back to the webview via `CAPBridge.notifyListeners("callAccepted" | "callDeclined")`.
- `Info.plist.additions.xml` — `UIBackgroundModes` (voip, audio, remote-notification, fetch), `NSMicrophoneUsageDescription`, `opoll://` scheme.
- `App.entitlements` — `aps-environment`, associated domains.
- `NotificationService/` — Notification Service Extension that downloads caller avatars when payload has `mutable-content: 1`.
- `ringtone.caf.README.md` — bundling instructions (≤30 s, IMA4/CAF).

**Why VoIP is mandatory**: Apple only allows the native CallKit full-screen UI when triggered by a VoIP push. Standard alert pushes will not reliably wake a killed app and cannot show the call screen.
