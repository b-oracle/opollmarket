# Full-Screen Incoming Call UI — Deployment Checklist

You currently see incoming calls as **regular push notifications** instead of the
WhatsApp/CallKit-style full-screen call screen. **This is not a code bug** — it
is because the native iOS (PushKit + CallKit) and Android (full-screen-intent)
code in `ios-native-ref/` and `android-native-ref/` has not yet been compiled
into your installed app.

A web push **cannot** render a full-screen call UI on iOS or Android. The OS
reserves that UI for apps that use specific native frameworks. The required
code is already written — it just has to be linked into a native build.

Below is the exact sequence to ship it. Do iOS or Android first — they are
independent.

---

## 🟢 Android (≈ 30 min)

1. On your dev machine: `git pull` then `npx cap add android` (skip if already added).
2. From the project root, run the bundled installer that copies every reference file into the right native paths and prints the manifest patches you still need to merge by hand:
   ```bash
   bash scripts/install-android-call-stack.sh
   ```
   The script writes:
   - `android-native-ref/CallMessagingService.kt`    → `android/app/src/main/java/com/opollmarket/app/`
   - `android-native-ref/IncomingCallActivity.kt`    → `android/app/src/main/java/com/opollmarket/app/`
   - `android-native-ref/CallActionReceiver.kt`      → `android/app/src/main/java/com/opollmarket/app/`
   - `android-native-ref/AudioRouterPlugin.kt`       → `android/app/src/main/java/com/opollmarket/app/`
   - `android-native-ref/activity_incoming_call.xml` → `android/app/src/main/res/layout/`
   - `android-native-ref/layout-land/activity_incoming_call.xml` → `android/app/src/main/res/layout-land/`
   - `android-native-ref/drawable/*.xml`             → `android/app/src/main/res/drawable/`
3. Drop a short ringtone (≤ 6 s, ≤ 200 KB MP3 / OGG) at `android/app/src/main/res/raw/ringtone.mp3`.
4. Register `AudioRouterPlugin` in `android/app/src/main/java/com/opollmarket/app/MainActivity.kt`:
   ```kotlin
   override fun onCreate(savedInstanceState: Bundle?) {
       registerPlugin(AudioRouterPlugin::class.java)
       super.onCreate(savedInstanceState)
   }
   ```
5. Merge `android-native-ref/AndroidManifest.additions.xml` into `android/app/src/main/AndroidManifest.xml`. The critical pieces:
   - `<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />`
   - `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />`
   - `<service android:name=".CallMessagingService">` with `com.google.firebase.MESSAGING_EVENT` intent filter
   - `<activity android:name=".IncomingCallActivity" android:showWhenLocked="true" android:turnScreenOn="true" />`
   - `<receiver android:name=".CallActionReceiver" android:exported="false" />`
   - `<data android:scheme="opoll" />` intent-filter on `.MainActivity`
6. Add Firebase: drop `google-services.json` into `android/app/`, apply the `com.google.gms.google-services` plugin in `android/app/build.gradle`, and add the Firebase BoM + `com.google.firebase:firebase-messaging` dependency.
7. Build a fresh APK in Android Studio (`Build → Build APK`) and install it.
8. **Test:** call the device while it is locked. You should see the full-screen `IncomingCallActivity` over the lockscreen with WhatsApp-style red Decline / green Accept buttons, ringtone, and pulse animation.

> On Android 14+ (`USE_FULL_SCREEN_INTENT`), the user must grant the permission
> in **Settings → Apps → opollmarket → Special access → Full-screen
> notifications**. The app should prompt for this on first launch — already
> handled by `useNativePush`.

---

## 🍎 iOS / CallKit (≈ 1 hour, requires a Mac)

CallKit (the green-and-red full-screen UI in your screenshot `IMG_6002.png`)
**only** triggers from a **PushKit VoIP push**, not from FCM and not from a
standard APNs alert. Setup steps:

1. On a Mac with Xcode 15+: `git pull` then `npx cap add ios` (skip if added).
2. Copy these files into `ios/App/App/`:
   - `ios-native-ref/VoipPushHandler.swift`
   - `ios-native-ref/CallProviderDelegate.swift`
3. Merge `ios-native-ref/AppDelegate.swift.additions.swift` into `ios/App/App/AppDelegate.swift`.
4. Merge `ios-native-ref/Info.plist.additions.xml` keys into `ios/App/App/Info.plist`:
   - `UIBackgroundModes` → `voip`, `audio`, `remote-notification`
   - `NSMicrophoneUsageDescription` (required or App Store rejects)
5. Merge `ios-native-ref/App.entitlements` into `ios/App/App/App.entitlements`:
   - `aps-environment` = `production`
6. In **Xcode → Signing & Capabilities** for the `App` target add:
   - **Push Notifications**
   - **Background Modes** → ✅ Voice over IP, ✅ Audio AirPlay PiP, ✅ Remote notifications
7. In **Apple Developer Portal → Identifiers → com.opollmarket.app**:
   - Enable **Push Notifications** capability.
   - Create an **APNs Auth Key (.p8)** — note the **Key ID** and **Team ID**.
8. Add these secrets to **Lovable Cloud → Settings → Secrets** so the
   `send-fcm-push` edge function can deliver VoIP pushes directly to APNs:
   - `APNS_AUTH_KEY_P8` — full contents of the `.p8` file
   - `APNS_KEY_ID`      — 10-character Key ID
   - `APNS_TEAM_ID`     — 10-character Team ID
   - `APNS_BUNDLE_ID`   — `com.opollmarket.app` (only if different)
9. Archive a build in Xcode and ship to TestFlight.
10. **Test:** install from TestFlight, lock the device, place a call. You should
    see the **system-rendered CallKit screen** (identical to FaceTime).

> On first launch after install, the app must call
> `PKPushRegistry.desiredPushTypes = [.voIP]` so iOS issues a VoIP token. The
> token gets POSTed to `register-fcm-token` with `token_type: "voip"`. Without
> this row in `user_fcm_tokens`, the server falls back to a plain alert push,
> which is what you are seeing right now.

---

## 🧪 How to confirm the VoIP / data-only path is working

After installing the new build, hit this admin tool to send yourself a test:

```
POST /functions/v1/admin-test-call-push
{ "user_id": "<your uuid>" }
```

Then check `push_delivery_logs` in the database:

| Row              | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `hint = null`, `ok = true`, `token_tail` ends with VoIP suffix | ✅ CallKit should fire on iOS |
| `hint = "voip-apns"`, `ok = false`                       | ❌ APNs secrets wrong or VoIP token expired   |
| `hint = null` and the only iOS row is `token_type=standard` | ⚠️ Device never registered a VoIP token — native PushKit code not running |

---

## TL;DR

**The push you're seeing IS the fallback path doing its job.** The full-screen
CallKit / lockscreen UI is one native build away — everything on the
server-side (`send-fcm-push`, `dm-call-token`, `user_fcm_tokens.token_type`) is
already wired up and waiting.
