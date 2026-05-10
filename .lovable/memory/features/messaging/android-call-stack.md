---
name: Android Call Notifications Stack
description: FCM data-only push, CallMessagingService, IncomingCallActivity full-screen intent. Accept must launch MainActivity directly. Notification MUST use NotificationCompat.CallStyle.forIncomingCall on Android 12+/14+ (Samsung One UI) or the FSI is silently dropped — vibration plays once and disappears.
type: feature
---
Android lockscreen incoming-call UI uses an FCM **data-only** payload → `CallMessagingService.onMessageReceived` → posts a `setFullScreenIntent` notification → `IncomingCallActivity` over the lockscreen.

**Required**: the notification MUST use `NotificationCompat.CallStyle.forIncomingCall(person, declineIntent, answerIntent)`. Without CallStyle, Android 14 (and Samsung One UI 6+) demote the notification, the FullScreenIntent never launches, and the user only feels a single vibration before it disappears. Plain `addAction` Accept/Decline does NOT count as a call notification to the OS anymore.

**Accept** must launch `MainActivity` directly (`PendingIntent.getActivity` / foreground `startActivity`), never via a `BroadcastReceiver`, to avoid Android 10+ Background-Activity-Launch (BAL) silently dropping the launch on Samsung/Xiaomi/etc.

**Decline** can stay on a BroadcastReceiver (uses `goAsync()` to keep the decline-HTTP POST alive after the notification is cancelled — does not need to bring the app to the foreground).

**Server side** (`send-fcm-push`): Android branch must be **data-only** (no top-level `notification` block) with `priority=HIGH`, otherwise `onMessageReceived` is bypassed and the system tray renders a plain notification instead.

**Why:** WhatsApp/Telegram/Signal all use CallStyle on modern Android — it's the only API that grants the call-priority FSI exemption.
