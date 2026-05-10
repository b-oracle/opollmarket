// Centralised dismissal for any incoming-call notification still on screen.
//
// Why this exists: incoming-call notifications can come from three places —
//   1. Capacitor LocalNotifications fallback (when FCM data-only push lands
//      while the app is foregrounded — see useNativePush.ts).
//   2. The native Android CallMessagingService CallStyle notification (shown
//      when the FCM push arrives while the app is killed — see
//      android-native-ref/CallMessagingService.kt). Posted via
//      NotificationManager.notify(NATIVE_CALL_NOTIFICATION_ID, …) — NOT via
//      the Capacitor plugin, so we must cancel it BY ID, not via cancelAll.
//   3. iOS CallKit (handled automatically by the OS once the call ends).
//
// Single helper that all accept/decline/end/navigate-away paths can call
// without thinking about platform plumbing. Safe to call repeatedly,
// safe to call on web (no-op).

const DISMISS_EVENT = "dm-call-notification-dismiss";

// Must match CallMessagingService.kt and CallActionReceiver.kt's
// CALL_NOTIFICATION_ID. If you change one, change them all.
const NATIVE_CALL_NOTIFICATION_ID = 1001;

// Per-reason coalescing: identical reasons fired in a tight loop are merged,
// but two DIFFERENT reasons (e.g. "banner-accept" then "route-change") both
// run. Previously a single global throttle silently dropped the second call,
// which was leaving the native CallStyle notification (id=1001) on screen.
const PER_REASON_COALESCE_MS = 150;
const lastDismissByReason = new Map<string, number>();

export async function dismissCallNotifications(reason: string = "unspecified"): Promise<void> {
  const now = Date.now();
  const last = lastDismissByReason.get(reason) || 0;
  if (now - last < PER_REASON_COALESCE_MS) return;
  lastDismissByReason.set(reason, now);

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

    // 1) Surgically cancel the native CallStyle notification (id=1001) posted
    //    by CallMessagingService.kt. Capacitor's LN.cancel() invokes the
    //    package-level NotificationManager.cancel(id), which clears any
    //    notification at that id regardless of who posted it — so this works
    //    for the native FCM-service notification too.
    try {
      await LN.cancel({ notifications: [{ id: NATIVE_CALL_NOTIFICATION_ID }] });
    } catch { /* ignore */ }

    // 2) Cancel any pending (scheduled) notifications — covers snooze re-arms.
    try {
      const pending = await LN.getPending();
      if (pending?.notifications?.length) {
        await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      }
    } catch { /* ignore */ }

    // 3) Targeted sweep of *delivered* call notifications only — avoids
    //    nuking unrelated tray items (DMs, missed-call follow-ups, ads). We
    //    inspect each delivered notification and cancel the ones tied to the
    //    incoming-call channel or the call action types.
    try {
      const delivered = await LN.getDeliveredNotifications();
      const toCancel = (delivered?.notifications || []).filter((n: any) => {
        const channel = n?.channelId || n?.channel || "";
        const actionType = n?.actionTypeId || "";
        const extraType = (n?.extra?.type || n?.data?.type || "") as string;
        return (
          channel === "incoming_calls" ||
          actionType === "INCOMING_CALL" ||
          actionType === "MISSED_CALL" ||
          extraType === "incoming_call" ||
          n?.id === NATIVE_CALL_NOTIFICATION_ID
        );
      });
      if (toCancel.length) {
        await LN.removeDeliveredNotifications({ notifications: toCancel as any });
      }
    } catch { /* ignore */ }
  } catch {
    // Plugin not installed or web — no-op.
  }
}

export const CALL_NOTIFICATION_DISMISS_EVENT = DISMISS_EVENT;
export { NATIVE_CALL_NOTIFICATION_ID };
