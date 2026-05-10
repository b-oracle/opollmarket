// Centralised dismissal for any incoming-call notification still on screen.
//
// Why this exists: incoming-call notifications can come from three places —
//   1. Capacitor LocalNotifications fallback (when FCM data-only push lands
//      while the app is foregrounded — see useNativePush.ts).
//   2. The native Android CallMessagingService CallStyle notification (shown
//      when the FCM push arrives while the app is killed — see
//      android-native-ref/CallMessagingService.kt).
//   3. iOS CallKit (handled automatically by the OS once the call ends).
//
// We need a single helper that ALL accept/decline/end/navigate-away paths can
// call without thinking about platform plumbing. Safe to call repeatedly,
// safe to call on web (no-op).
//
// The helper also broadcasts a `dm-call-notification-dismiss` window event so
// any future native plugin can subscribe and cancel its own ongoing channel
// notification (we currently bridge it for the Android CallStyle path via the
// app-level message listener in MainActivity).

const DISMISS_EVENT = "dm-call-notification-dismiss";

let lastDismissAt = 0;
const DISMISS_THROTTLE_MS = 250;

export async function dismissCallNotifications(reason: string = "unspecified"): Promise<void> {
  // Throttle bursts (accept→navigate→unmount can all fire within one tick).
  const now = Date.now();
  if (now - lastDismissAt < DISMISS_THROTTLE_MS) return;
  lastDismissAt = now;

  // Broadcast first so any in-app listeners (banner, overlay, native bridge)
  // can react synchronously even before the async plugin call resolves.
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(DISMISS_EVENT, { detail: { reason } }));
    } catch {
      // ignore
    }
  }

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const mod = await import("@capacitor/local-notifications");
    const LN = mod.LocalNotifications;

    // Clear anything currently in the tray AND any pending scheduled
    // notifications (in case a snooze re-arm was queued).
    try { await LN.removeAllDeliveredNotifications(); } catch { /* ignore */ }
    try {
      const pending = await LN.getPending();
      if (pending?.notifications?.length) {
        await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      }
    } catch {
      // ignore
    }
  } catch {
    // Plugin not installed or web — no-op.
  }
}

export const CALL_NOTIFICATION_DISMISS_EVENT = DISMISS_EVENT;
