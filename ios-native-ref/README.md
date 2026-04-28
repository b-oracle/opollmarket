# iOS Lockscreen Call Ringing — Drop-in Reference

WhatsApp-style **CallKit + PushKit (VoIP)** incoming-call UI for a custom Capacitor iOS build.
This folder is a reference — copy files into your Xcode project at the paths indicated.
The Android equivalent lives in `../android-native-ref/`.

## What this delivers

- A **VoIP push** (`apns-push-type: voip`, topic `com.opollmarket.app.voip`) arrives on the device.
- iOS launches the app **silently in the background** even if it was killed (PushKit requirement).
- `PKPushRegistryDelegate.didReceiveIncomingPushWith` fires → we **must** call `CXProvider.reportNewIncomingCall(...)` within ~5 seconds or iOS will kill the process and disable VoIP for the app.
- CallKit shows the **native green/red full-screen call screen** over the lockscreen with system ringtone, haptics, and Bluetooth/Speaker routing — identical to a regular phone call.
- User taps **Accept** → `CXAnswerCallAction` fires → we open `MainViewController` with a deep link `opoll://call/accept?call_id=…&conversation_id=…&auto_accept=1` and the webview routes to `/messages/<conversation_id>?call_id=…&auto_accept=1`.
- User taps **Decline** → `CXEndCallAction` fires → we POST to `dm-call-cancel` to mark the call rejected.
- A separate **Notification Service Extension** rewrites alert payloads to attach the caller avatar (`mutable-content: 1`).

## Files

```
ios/App/
├── App/
│   ├── AppDelegate.swift                     ← merge additions (PushKit + CallKit bootstrap)
│   ├── CallProviderDelegate.swift            ← CallKit provider (NEW)
│   ├── VoipPushHandler.swift                 ← PushKit registry + VoIP push handler (NEW)
│   ├── Info.plist                            ← merge (Background Modes, NSMicrophoneUsageDescription)
│   ├── App.entitlements                      ← merge (aps-environment, voip)
│   └── ringtone.caf                          ← bundled ringtone (any short caf/aif/m4a, < 30s)
└── NotificationService/                      ← NEW target (Notification Service Extension)
    ├── NotificationService.swift
    └── Info.plist
```

## Prereqs

1. **Eject to a custom Capacitor iOS project** (`npx cap add ios`). Despia / hosted wrappers do not expose PushKit.
2. In **Apple Developer → Certificates, Identifiers & Profiles**:
   - Enable **Push Notifications** capability on the App ID `com.opollmarket.app`.
   - Generate an **APNs Auth Key (.p8)** — note the **Key ID** and **Team ID**.
3. In **Xcode → Signing & Capabilities** for the `App` target add:
   - **Push Notifications**
   - **Background Modes** → check `Voice over IP`, `Audio, AirPlay, and Picture in Picture`, `Remote notifications`, `Background fetch`.
4. Add a **Notification Service Extension** target named `NotificationService` (File → New → Target). Copy the two files in `NotificationService/`.
5. Add `ringtone.caf` to the **App** target (not the extension). Any short audio file works; convert with:
   ```bash
   afconvert ringtone.mp3 ringtone.caf -d ima4 -f caff -v
   ```
6. Run `npx cap sync ios` after every web-side change.

## Required server-side secrets

For VoIP delivery the `send-fcm-push` edge function calls APNs **directly** (FCM does not relay VoIP). Add these to Lovable Cloud secrets:

| Secret | Where to find it |
| --- | --- |
| `APNS_AUTH_KEY_P8` | Contents of the `AuthKey_<KEYID>.p8` file you downloaded from Apple Developer (paste the whole `-----BEGIN PRIVATE KEY-----…` block). |
| `APNS_KEY_ID` | 10-character Key ID shown next to the key in Apple Developer. |
| `APNS_TEAM_ID` | 10-character Team ID (Apple Developer → Membership). |
| `APNS_BUNDLE_ID` | Optional. Defaults to `com.opollmarket.app`. |
| `APNS_USE_SANDBOX` | Set to `1` only while building with a Debug provisioning profile against the sandbox environment. Leave unset for App Store / TestFlight. |

Without these secrets the function still works for Android and for standard iOS alert pushes — only VoIP delivery is skipped.

## Token registration

On the device, register **two** tokens against the user:

| `platform` | `token_type` | Source | Used for |
| --- | --- | --- | --- |
| `ios` | `standard` | `UIApplication.registerForRemoteNotifications()` (APNs) | Background data, missed-call alerts, generic notifications |
| `ios` | `voip` | `PKPushRegistry.didUpdate` | Incoming-call wake-up that triggers CallKit |

Use the existing `register-fcm-token` flow but pass `token_type: "voip"` for the PushKit token. The DB column was added in migration `2026-04-28-add-token-type`.

## Why not just send a regular APNs alert with `category: INCOMING_CALL`?

That's what we do **today** and it works while the app is in the foreground or recently backgrounded. But:

- A regular alert push **will not reliably wake a killed app** — iOS may show only a banner.
- Apple **only** allows full-screen-style call UI through CallKit, and CallKit **requires** a VoIP push within 5 seconds of the OS waking your process.
- VoIP pushes are also the only push type that bypass low-power mode and Focus filters for call-style interruptions.

## Deep-link handling in your web app

When `CXAnswerCallAction` fires, `CallProviderDelegate` invokes `Capacitor.notifyListeners("callAccepted", { callId, conversationId })`. The existing `useNativePush` listener already routes to `/messages/<conversation_id>?call_id=<id>&auto_accept=1`, so no web-side changes are required.
