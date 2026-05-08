# Android Accept-Flow OEM Verification Checklist

This document covers verification of the Accept-tap deep-link path on
Android 12+ across the major OEM skins where Background Activity Launch
(BAL) restrictions are most aggressive.

> **Code under test:** `CallMessagingService.showIncomingCall()` and
> `IncomingCallActivity.btn_accept` — both launch `MainActivity` directly
> via `PendingIntent.getActivity()` / foreground `startActivity()` (never
> through a `BroadcastReceiver`). See inline comments in those files for
> the rationale.

---

## Why direct `PendingIntent.getActivity` works

When the system fires a notification's `contentIntent` or action
`PendingIntent`, it attaches a **foreground activation token** to the
launch. Android's BAL guard treats that token as an explicit user
gesture and lets the activity start regardless of process state.

Routing through a `BroadcastReceiver` strips that token: by the time
the receiver calls `startActivity()`, the launch is now "from the
background" and Android 10+ silently drops it. WhatsApp, Signal, and
Telegram all use the direct `getActivity` path for the same reason.

---

## Per-OEM verification matrix

| OEM / Skin | Min OS | Status | Notes |
|---|---|---|---|
| **Stock Android (Pixel)** | 12 → 15 | ✅ Reliable | Reference behaviour. |
| **Samsung One UI 5/6/7** | 12 → 14 | ✅ Reliable | Requires app NOT to be put to sleep — see "Adaptive Battery" below. |
| **Xiaomi MIUI 13/14 / HyperOS** | 12 → 14 | ⚠️ Needs permissions | Autostart + "Show on lock screen" required. |
| **Oppo / Realme ColorOS 13/14** | 12 → 14 | ⚠️ Needs permissions | Auto-launch toggle required per app. |
| **Vivo / iQOO FuntouchOS / OriginOS** | 12 → 14 | ⚠️ Needs permissions | Background popup + auto-start required. |
| **Honor MagicOS** | 12 → 14 | ⚠️ Needs permissions | Same as Huawei EMUI legacy. |

---

## Manual verification script (per device)

Run this on every target device. Each step should produce the result in
**bold** within ~1 second.

### Setup

1. Install signed release APK (debug builds get extra leniency — always
   verify on release).
2. Sign in. Confirm FCM token registered: in Logcat
   `adb logcat -s CallMessagingService` should show
   `onMessageReceived data=...` when a test push lands.
3. Grant notification permission, microphone permission,
   `USE_FULL_SCREEN_INTENT` (Android 14+ prompts on first call).

### Tests

#### A. App **closed** (process killed), screen **locked**

1. Force-stop opollmarket.
2. Lock the device.
3. From a second account, call this device.

Expected:
- Lockscreen ringer activity (`IncomingCallActivity`) appears within 2 s.
- Tap **Accept** on the lockscreen → **device unlocks → MainActivity
  foregrounds → call connects within 3 s** (no manual app-open).

Failure modes & remediation:
- *Notification fires but lockscreen activity does not appear* → OEM
  blocked `setFullScreenIntent`. Heads-up notification still works as
  fallback; tapping Accept on the heads-up should still launch the app.
  Direct user to enable full-screen permission in app settings.
- *Lockscreen activity appears, Accept does nothing* → BAL blocked the
  activity launch. Should not happen with the current direct-launch
  code. If it does, capture
  `adb logcat -s ActivityTaskManager BackgroundActivityStartController`
  and look for `Background activity launch blocked`.

#### B. App **closed**, screen **unlocked**, on home screen

Expected:
- Heads-up notification banner appears.
- Tap notification body OR the **Accept** action → **MainActivity opens
  and call connects within 2 s**.

#### C. App in **background** (recently used, swiped away from view but
still in memory), screen **unlocked**

Expected: same as B.

#### D. App in **foreground** on a non-call screen

Expected:
- The in-app `IncomingCallScreen` overlay appears immediately
  (driven by the realtime `dm_calls` INSERT, not FCM).
- Tap Accept → call connects.

#### E. Accept after **>30 minutes** of device idle (Doze mode)

- Leave device locked and untouched for 30+ minutes.
- Trigger a call.

Expected: same as A.

Failure modes:
- *FCM push delayed several seconds* → OEM Doze; high-priority data
  message is delivered eventually. Confirm the message has
  `priority: "high"` and `content_available: true` in the edge-function
  payload (see `supabase/functions/dm-call-notify/`).

---

## OEM-specific edge cases & remediation

### Samsung One UI

- **"Put unused apps to sleep"** (Settings → Battery → Background usage
  limits) will throttle FCM and break test E. Add opollmarket to
  *Never sleeping apps*.
- **Game Booster / Modes & Routines** can suppress full-screen intents
  during Driving/Theatre mode — expected, not a bug.
- One UI 6.1+ correctly honours `setShowWhenLocked` + `setTurnScreenOn`.

### Xiaomi MIUI / HyperOS

- **Autostart** (Settings → Apps → Permissions → Autostart) MUST be on
  for opollmarket. Without it, the FCM service is killed and the
  notification never posts when the app is closed.
- **Show on lock screen** (per-app permission) MUST be on or
  `IncomingCallActivity` cannot draw over the keyguard.
- **Battery saver → No restrictions** for opollmarket.
- MIUI 14+ has a **"Lock screen notifications display the entire
  message"** toggle — recommended on for the Accept/Decline buttons to
  render reliably.
- Known harmless quirk: the lockscreen activity sometimes flashes black
  for ~150 ms before drawing — MIUI's keyguard transition, not us.

### Oppo / Realme ColorOS

- **Settings → Battery → App Battery Management → opollmarket** → enable
  *Allow background activity*, *Allow auto-launch*, and *Allow related
  apps to be auto-launched* (the latter lets the FCM listener service
  resurrect the call activity).
- ColorOS 14 enforces strict full-screen intent gating: the system will
  drop `setFullScreenIntent` after the **3rd** consecutive call within
  10 minutes. Test E catches this.

### Vivo / iQOO

- **i Manager → App Manager → Autostart manager** — enable opollmarket.
- **i Manager → App Manager → Permission Manager → Background popup
  interface** — enable opollmarket. This is the single most common
  reason Accept silently no-ops on Vivo.

### Honor MagicOS / legacy Huawei EMUI

- **Settings → Apps → opollmarket → Battery → App launch** → set to
  Manual, then enable *Auto-launch*, *Secondary launch*, and *Run in
  background* (all three).

### Android 14+ (all OEMs) — `USE_FULL_SCREEN_INTENT`

Apps that target Android 14+ no longer get full-screen intent privilege
automatically. We declare it in `AndroidManifest.additions.xml` and the
system shows the user a one-time toggle the first time it's used. If
the user denies it, our notification gracefully degrades to a heads-up
with the same Accept action — the deep-link path still works.

To pre-prompt users, deep-link them to:
```kotlin
Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
    .setData(Uri.parse("package:$packageName"))
```

### Android 14+ — `PendingIntent` BAL opt-in

Android 14 added `PendingIntentCreator.setPendingIntentBackgroundActivityStartMode()`
for callers of `PendingIntent.send()`. This is **not relevant** to our
flow because the **system** is the one calling `send()` (the notification
tap), and the system always opts in. No code change needed.

If we ever fire our own `PendingIntent.send()` for a call action, we
would need:
```kotlin
val opts = ActivityOptions.makeBasic()
    .setPendingIntentBackgroundActivityStartMode(
        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
pendingIntent.send(context, 0, intent, null, null, null, opts.toBundle())
```

---

## Diagnostic commands

Run these against an attached device while reproducing a failure.

```bash
# Watch the FCM service + activity launches in real time
adb logcat -s CallMessagingService IncomingCallActivity \
  ActivityTaskManager BackgroundActivityStartController

# Confirm the notification was actually posted
adb shell dumpsys notification --noredact | grep -A 20 opollmarket

# Confirm the full-screen intent permission state (Android 14+)
adb shell dumpsys notification --noredact | grep -i "fullScreen"

# See if the OEM sleeping-apps list contains us (Samsung)
adb shell dumpsys deviceidle whitelist | grep opollmarket
```

Capture the relevant chunk and attach it to any "Accept does nothing"
bug report so we can distinguish:
1. FCM never delivered (network / Doze / autostart).
2. Notification posted but Accept not clickable (full-screen intent
   denied / OEM lockscreen restrictions).
3. Accept tapped, BAL blocked the activity launch (regression — should
   not happen with current code).
