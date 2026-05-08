# Android Lockscreen Call Ringing — Drop-in Reference

WhatsApp-style full-screen-intent incoming call UI for a **custom Capacitor Android build**.
This folder is a reference — copy files into your Android Studio project at the paths indicated.

## What this delivers

- Data-only FCM push arrives → `CallMessagingService.onMessageReceived` fires even when the app is killed.
- A high-priority notification with a **full-screen intent** is posted on the `incoming_calls` channel (IMPORTANCE_HIGH, bypass DND, category = CATEGORY_CALL).
- On locked device, Android shows the `IncomingCallActivity` **over the lockscreen** with ringtone + vibration.
- User taps **Accept** → `IncomingCallActivity` (or the notification's Accept `PendingIntent.getActivity`) launches `MainActivity` **directly** with `opoll://call/accept?call_id=…&conversation_id=…`. The webview foregrounds instantly and `useCallDeepLink` navigates to `/messages/<conversation_id>?call_id=...&auto_accept=1`, where `ChatView`'s auto-accept effect joins the call. ⚠️ Accept must NEVER hop through a `BroadcastReceiver` to launch `MainActivity` — Android 10+ Background-Activity-Launch rules silently drop activity starts from background broadcasts on most OEMs (Samsung/Xiaomi/etc.), which makes the call appear to "do nothing" until the user opens the app manually. Direct `PendingIntent.getActivity` / `startActivity` from the foreground `IncomingCallActivity` carries the foreground activation token and bypasses BAL — same path WhatsApp uses.
- User taps **Decline** → `CallActionReceiver` is fine (and preferred) because it uses `goAsync()` to keep the decline-HTTP POST alive after the notification dismisses, and it does not need to bring the app to the foreground.

## Files

```
android/app/src/main/
├── AndroidManifest.xml                    ← merge the additions
├── java/.../CallMessagingService.kt       ← FCM receiver (NEW)
├── java/.../IncomingCallActivity.kt       ← lockscreen UI (NEW)
├── java/.../CallActionReceiver.kt         ← accept/decline broadcast (NEW)
├── res/layout/activity_incoming_call.xml  ← UI layout (NEW)
├── res/values/strings.xml                 ← strings (merge)
└── res/raw/ringtone.mp3                   ← your ringtone asset
```

## Prereqs

1. **Eject to a custom Capacitor Android project** (`npx cap add android` on a fresh clone, then `npx cap sync`). Despia wrappers do not expose these APIs.
2. Add **Firebase** to the project: drop `google-services.json` into `android/app/`, apply the `com.google.gms.google-services` plugin in `android/app/build.gradle`, add the Firebase BoM + messaging dependency.
3. Register the device's FCM token with your existing `user_fcm_tokens` table via a small Capacitor plugin call on app start (out of scope for this ref — you already have `useNativePush`).

## Required permissions (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.DISABLE_KEYGUARD" />
<uses-permission android:name="android.permission.TURN_SCREEN_ON" />
```

> `USE_FULL_SCREEN_INTENT` is a normal permission up to API 33 and an **app-op** on API 34+.
> For API 34+ you must either (a) be a default dialer/messaging app, or (b) the user grants it in Settings → Apps → Special access. You can open the settings page with `Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`.

## Server side (already done)

- `send-fcm-push` now sends **data-only** FCM messages when `is_call: true`, so the service handler always runs (notification messages skip it when the app is backgrounded).
- `dm-call-token` attaches `caller_id`, `caller_name`, `caller_avatar`, `conversation_id` to the push `data`.
- Payload shape received on Android:

```json
{
  "type": "incoming_call",
  "title": "Incoming Call 📞",
  "body": "Jane is calling you",
  "call_id": "<uuid>",
  "caller_id": "<uuid>",
  "caller_name": "Jane",
  "caller_avatar": "https://...",
  "conversation_id": "<uuid>",
  "url": "/messages/<conversation_id>"
}
```

## Deep-link handling in your web app

When the activity opens `MainActivity` with `intent.data = opoll://call/accept?call_id=…&conversation_id=…`, your Capacitor `App` listener routes to `/messages/<conversation_id>?call_id=<id>&auto_accept=1`. Add handling in `MessageThread.tsx` to auto-accept when `auto_accept=1`.
