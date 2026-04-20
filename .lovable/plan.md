
## Native Calls — What's Left for the Capacitor Build

The web/server side is done. Below is everything still required to make WhatsApp-style native calls actually ring on a physical Android device. iOS is intentionally deferred (you don't have the VoIP cert yet).

### Status snapshot

Done already:
- `send-fcm-push` sends data-only FCM with `is_call: true` and HIGH priority
- `dm-call-token` includes `caller_name`, `caller_avatar`, `conversation_id` in the payload
- `useCallDeepLink` hook parses `opoll://call/accept?...`
- `IncomingCallBanner` auto-accepts when `auto_accept=1` is in the URL
- Reference Kotlin/XML files exist in `android-native-ref/`

Not done — required to ring on lockscreen:

---

### 1. Eject to a custom Capacitor Android project (one-time)

Despia's wrapper cannot host the native code. You need your own Android Studio project.

```bash
git pull                  # pull the latest from GitHub
npm install
npx cap add android
npm run build
npx cap sync android
npx cap open android      # opens Android Studio
```

After this, `android/` is committed to your repo and you maintain it like any native app.

---

### 2. Add Firebase to the Android project

1. Create a Firebase project (or reuse the one whose Service Account JSON you pasted into `FCM_SERVICE_ACCOUNT_JSON`).
2. Add an Android app with package id `app.lovable.fbc135e2c42c4d3fbb3ee7385ced809f` (matches `capacitor.config.ts`).
3. Download `google-services.json` → place in `android/app/`.
4. In `android/build.gradle` add classpath `com.google.gms:google-services:4.4.2`.
5. In `android/app/build.gradle` apply `com.google.gms.google-services` and add:
   ```
   implementation platform('com.google.firebase:firebase-bom:33.5.1')
   implementation 'com.google.firebase:firebase-messaging-ktx'
   ```

---

### 3. Drop in the native call files

Copy from `android-native-ref/` into the new Android project (replace `<your.package>` with `app.lovable.fbc135e2c42c4d3fbb3ee7385ced809f`):

| Source | Destination |
|---|---|
| `CallMessagingService.kt` | `android/app/src/main/java/<pkg>/CallMessagingService.kt` |
| `IncomingCallActivity.kt` | `android/app/src/main/java/<pkg>/IncomingCallActivity.kt` |
| `CallActionReceiver.kt` | `android/app/src/main/java/<pkg>/CallActionReceiver.kt` |
| `activity_incoming_call.xml` | `android/app/src/main/res/layout/activity_incoming_call.xml` |
| `AndroidManifest.additions.xml` | merge into `android/app/src/main/AndroidManifest.xml` |

Also add a ringtone:
- `android/app/src/main/res/raw/ringtone.mp3` (any short looping mp3, ≤ 1 MB)

---

### 4. Wire the FCM token up to Supabase

The activity rings only if the device is registered. You need a tiny native bridge that calls `FirebaseMessaging.getInstance().token` on app start and sends it to your existing `user_fcm_tokens` table.

Two options (pick one in implementation):

- **Use the existing `@capacitor/push-notifications` plugin** — it already exposes the FCM token on Android. Hook it into your current `useNativePush` hook so on native Android it upserts into `user_fcm_tokens` with `platform = 'android'`.
- **Write a tiny custom Capacitor plugin** that listens to `CallMessagingService.onNewToken` and forwards to JS. Heavier; only needed if push-notifications plugin doesn't fire reliably.

Recommended: extend `useNativePush` (already in repo) to handle the Android FCM token path.

---

### 5. Permissions & Android 14+ gotcha

Manifest already includes `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, etc. Two runtime steps needed:

1. **POST_NOTIFICATIONS** — request at runtime on first launch (Android 13+). The push-notifications plugin handles this if you call `requestPermissions()`.
2. **USE_FULL_SCREEN_INTENT** on Android 14+ — Google now restricts this to dialer/messaging apps by default. For everyone else, the user must grant it in *Settings → Apps → Special access*. Add a one-time prompt that opens:
   ```
   Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
   ```
   This is a small Capacitor plugin call or can be done from `MainActivity` on first launch.

Without step 2, the lockscreen UI silently degrades to a heads-up notification on Android 14+.

---

### 6. Verify the deep-link intent filter

`AndroidManifest.additions.xml` declares the `opoll://` scheme on `MainActivity`. After merging, confirm the existing Capacitor `MainActivity` block has the filter — the additions file shows the pattern. Without this, tapping Accept opens the app but doesn't route to the call.

---

### 7. Build, install, and test

```bash
npm run build
npx cap sync android
npx cap run android        # plug in a real device — emulators are flaky for FCM
```

End-to-end test checklist:
1. Sign in on the device → confirm an `android` row appears in `user_fcm_tokens` for your user.
2. Lock the device.
3. From another account, start a voice call to that user.
4. Lockscreen should ring with caller name + Accept/Decline within ~3 seconds.
5. Tap Accept → app opens directly into the call thread, mic engaged.
6. Tap Decline → notification dismisses, caller sees "call rejected".
7. Use **Admin Settings → FCM Push Diagnostics** with the device token to dry-run the FCM v1 path if anything fails.

---

### 8. (Later) iOS CallKit prerequisites

When you're ready for iOS:
- Generate VoIP Services Certificate (.p8 preferred) in Apple Developer portal
- Add `@capacitor-community/callkit` + PushKit handler
- New edge function or branch in `dm-call-token` to send to APNs `voip` topic
- Add `user_voip_tokens` table for PushKit tokens (separate from APNs tokens)

Not in scope for this round — flagged so you know what's coming.

---

### Effort estimate

| Step | Time |
|---|---|
| Eject + Firebase setup | 30–45 min |
| Copy native files + manifest merge | 15 min |
| FCM token bridge in `useNativePush` | 30 min |
| Full-screen intent permission flow (Android 14+) | 20 min |
| End-to-end testing on device | 30–60 min |
| **Total** | **~2–3 hours** of native work, mostly local |

All of it happens in your local checkout + Android Studio. No more Lovable-side server changes are required for the Android call path.
