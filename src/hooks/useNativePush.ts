import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import {
  startIncomingCallVibration,
  stopVibration,
  vibrate,
  CALL_RING_PATTERN,
} from "@/lib/haptics";
import { logCallEvent } from "@/lib/callEvents";

// Tracks the active foreground-call vibration cancel function so we can stop
// it when the user accepts/declines or when the call FCM "ended" arrives.
let activeCallVibrationCancel: (() => void) | null = null;

// Persist the latest incoming call context so notification action buttons
// (Accept / Mute / Decline) keep working even after a cold start, where the
// OS may deliver the action with a stripped-down `extra` payload.
const LATEST_CALL_KEY = "latest_incoming_call_v1";
const LATEST_CALL_TTL_MS = 2 * 60 * 1000; // calls only ring for ~30–60s

type LatestCall = {
  call_id: string;
  conversation_id: string;
  caller_id?: string;
  caller_name?: string;
  caller_avatar?: string;
  saved_at: number;
};

const saveLatestCall = (data: Record<string, string>) => {
  if (typeof window === "undefined") return;
  const callId = data.call_id || "";
  if (!callId) return;
  try {
    const payload: LatestCall = {
      call_id: callId,
      conversation_id: data.conversation_id || "",
      caller_id: data.caller_id,
      caller_name: data.caller_name,
      caller_avatar: data.caller_avatar,
      saved_at: Date.now(),
    };
    localStorage.setItem(LATEST_CALL_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota/serialization errors
  }
};

export const readLatestCall = (): LatestCall | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LATEST_CALL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatestCall;
    if (!parsed?.call_id) return null;
    if (Date.now() - parsed.saved_at > LATEST_CALL_TTL_MS) {
      localStorage.removeItem(LATEST_CALL_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const clearLatestCall = () => {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(LATEST_CALL_KEY); } catch { /* ignore */ }
};

const stopForegroundCallRing = () => {
  if (activeCallVibrationCancel) {
    activeCallVibrationCancel();
    activeCallVibrationCancel = null;
  }
  stopVibration();
};

// ---- Snooze (mute) timer --------------------------------------------------
// When the user taps "Mute" on an incoming-call notification, we silence the
// ring/vibration but keep the call ringing for the caller. After SNOOZE_MS,
// if the call is still in `ringing` status (not accepted, declined, missed,
// or ended), we re-arm the local ring so the user gets a second chance to
// answer — same UX as iOS/Android system phone apps.
// Default snooze duration (when user taps the plain "Mute" button — kept for
// backwards compatibility). Explicit snooze actions below let the user pick
// 10s / 1m / 5m instead.
const SNOOZE_MS = 15_000;
const SNOOZE_OPTIONS_MS: Record<string, number> = {
  snooze_10s: 10_000,
  snooze_1m: 60_000,
  snooze_5m: 5 * 60_000,
};
let snoozeTimer: ReturnType<typeof setTimeout> | null = null;
let snoozedCallId: string | null = null;
let snoozeStatusChannel: ReturnType<typeof supabase.channel> | null = null;

const teardownSnoozeStatusChannel = () => {
  if (snoozeStatusChannel) {
    try { supabase.removeChannel(snoozeStatusChannel); } catch { /* ignore */ }
    snoozeStatusChannel = null;
  }
};

const clearSnoozeTimer = () => {
  if (snoozeTimer) {
    clearTimeout(snoozeTimer);
    snoozeTimer = null;
  }
  snoozedCallId = null;
  teardownSnoozeStatusChannel();
};

const isCallStillRinging = async (callId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from("dm_calls")
      .select("status")
      .eq("id", callId)
      .maybeSingle();
    if (error || !data) return false;
    return data.status === "ringing";
  } catch {
    return false;
  }
};

const scheduleSnoozeRearm = (callId: string, durationMs: number = SNOOZE_MS) => {
  clearSnoozeTimer();
  if (!callId) return;
  snoozedCallId = callId;

  // Watch the call row: if it transitions out of `ringing` (missed, declined,
  // ended, accepted-elsewhere) we must cancel the snooze immediately so we
  // don't re-ring the user for a call they can no longer act on.
  try {
    snoozeStatusChannel = supabase
      .channel(`snooze-call-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_calls",
          filter: `id=eq.${callId}`,
        },
        (payload) => {
          const nextStatus = (payload.new as { status?: string } | null)?.status;
          if (nextStatus && nextStatus !== "ringing") {
            // No longer actionable — cancel snooze without re-ringing.
            clearSnoozeTimer();
          }
        },
      )
      .subscribe();
  } catch {
    // realtime optional; the setTimeout fallback below still gates on status
  }

  snoozeTimer = setTimeout(async () => {
    const target = snoozedCallId;
    snoozeTimer = null;
    snoozedCallId = null;
    teardownSnoozeStatusChannel();
    if (!target) return;
    // Only re-ring if the call is still pending; otherwise the lifecycle
    // event we missed (declined / ended / accepted elsewhere) means we
    // should stay silent.
    const stillRinging = await isCallStillRinging(target);
    if (!stillRinging) return;

    try {
      stopForegroundCallRing();
      activeCallVibrationCancel = startIncomingCallVibration();
      // Notify any listeners (banner, overlays) that we re-armed the ring.
      window.dispatchEvent(
        new CustomEvent("dm-call-action", {
          detail: { action: "snooze_expired", call_id: target, duration_ms: durationMs },
        }),
      );
      logCallEvent(target, "received", { source: "snooze_rearm", duration_ms: durationMs });
    } catch {
      // ignore
    }
  }, durationMs);
};

if (typeof window !== "undefined") {
  // The IncomingCallBanner fires this when the user accepts/declines or the
  // banner auto-dismisses, so we don't double-buzz the device.
  window.addEventListener("dm-call-banner-dismissed", () => {
    stopForegroundCallRing();
    clearSnoozeTimer();
  });
}

// Registers the device with FCM (Android) / APNs (iOS) via Capacitor,
// stores the token in user_fcm_tokens, and routes foreground notification
// taps into the app. Also surfaces a local notification + ringing vibration
// when data-only call pushes arrive while the app is foregrounded (the
// native lockscreen UI handles the killed-app case, see android-native-ref/).
// No-op on web.
export const useNativePush = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const platform = Capacitor.getPlatform();

        const { PushNotifications } = await import("@capacitor/push-notifications");

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== "granted") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        // Also request local-notification permission (used as foreground
        // fallback for data-only call pushes). On Android, register a
        // dedicated high-importance channel so the call notification bypasses
        // DND and uses the ring vibration pattern.
        let LocalNotifications:
          | typeof import("@capacitor/local-notifications").LocalNotifications
          | null = null;
        try {
          const mod = await import("@capacitor/local-notifications");
          LocalNotifications = mod.LocalNotifications;
          const lnPerm = await LocalNotifications.checkPermissions();
          if (lnPerm.display !== "granted") {
            await LocalNotifications.requestPermissions();
          }

          // Register Accept/Decline action buttons that appear on the
          // incoming-call notification. Tapping a button fires
          // `localNotificationActionPerformed` with actionId = "accept" | "decline".
          try {
            await LocalNotifications.registerActionTypes({
              types: [
                {
                  id: "INCOMING_CALL",
                  actions: [
                    { id: "accept", title: "Accept" },
                    // One-tap shortcut to the caller's chat thread without
                    // accepting / declining the call.
                    { id: "view_chat", title: "View chat" },
                    // Snooze options — local-only mute for the chosen duration.
                    // iOS/Android notifications don't support nested submenus,
                    // so we expose each duration as its own button.
                    { id: "snooze_10s", title: "Snooze 10s" },
                    { id: "snooze_1m", title: "Snooze 1m" },
                    { id: "snooze_5m", title: "Snooze 5m" },
                    { id: "decline", title: "Decline", destructive: true },
                  ],
                },
                {
                  // Used by missed-call notifications so the user can jump
                  // straight to the chat thread from the notification tray.
                  id: "MISSED_CALL",
                  actions: [
                    { id: "view_chat", title: "View chat" },
                  ],
                },
              ],
            });
          } catch (err) {
            console.warn("Failed to register call action types:", err);
          }

          if (platform === "android") {
            try {
              await LocalNotifications.createChannel({
                id: "incoming_calls",
                name: "Incoming Calls",
                description: "Ringing notifications for incoming voice/video calls",
                importance: 5, // IMPORTANCE_HIGH
                visibility: 1, // VISIBILITY_PUBLIC (show on lockscreen)
                vibration: true,
                lights: true,
                sound: "ringtone", // res/raw/ringtone.mp3 (when present in native build)
              });
              await LocalNotifications.createChannel({
                id: "default",
                name: "General Notifications",
                description: "App notifications",
                importance: 4, // IMPORTANCE_DEFAULT (high to ensure delivery)
                visibility: 1,
                vibration: true,
              });
            } catch (err) {
              console.warn("Failed to create notification channels:", err);
            }
          }
        } catch {
          // plugin missing — fine, only used for foreground fallback.
        }

        const regSub = await PushNotifications.addListener("registration", async (tok) => {
          try {
            await supabase.from("user_fcm_tokens" as any).upsert(
              {
                user_id: user.id,
                token: tok.value,
                platform,
              },
              { onConflict: "user_id,token" }
            );
          } catch (err) {
            console.warn("Failed to save FCM token:", err);
          }
        });

        const errSub = await PushNotifications.addListener("registrationError", (err) => {
          console.warn("Push registration error:", err);
        });

        // Foreground push received — surface a banner notification + ringing buzz.
        // For incoming-call data pushes we trigger the looping ring pattern so
        // the user notices even if the app is silent or muted, and we render a
        // local notification (data-only FCM payloads don't show one by default).
        const recvSub = await PushNotifications.addListener(
          "pushNotificationReceived",
          async (notification) => {
            const data = (notification.data || {}) as Record<string, string>;
            const isCall =
              data.type === "incoming_call" ||
              data.is_call === "true" ||
              data.is_call === "1";
            const isMissedCall = data.type === "call_missed";
            const isCallTerminated =
              data.type === "call_ended" || data.type === "call_declined";

            // For ended/declined: just stop any active ring loop and return.
            // For missed: stop the ring but still render a local notification
            // with the "View chat" action so the user can jump to the thread.
            if (isCallTerminated) {
              stopForegroundCallRing();
              clearSnoozeTimer();
              clearLatestCall();
              return;
            }

            if (isMissedCall) {
              stopForegroundCallRing();
              clearSnoozeTimer();
              clearLatestCall();
              // fall through to render the missed-call notification below
            } else if (isCall) {
              // Persist the call context so cold-started action handlers
              // (Accept / Mute / Decline) can recover ids if the OS strips
              // the notification's `extra` payload.
              saveLatestCall(data);

              // A new incoming-call push supersedes any prior snooze.
              clearSnoozeTimer();

              // Start the looping WhatsApp-style ring pattern. The
              // IncomingCallBanner runs its own pattern when it mounts, but
              // this hook fires earlier (data-only FCM lands before the
              // banner subscribes via realtime), so we kick off vibration
              // immediately and the banner takes over once it appears.
              stopForegroundCallRing();
              activeCallVibrationCancel = startIncomingCallVibration();
            }

            // If FCM didn't render a system notification (data-only payload),
            // fall back to a local one so it appears in the tray + buzzes.
            const hasSystemNotif = !!notification.title || !!notification.body;
            if (!hasSystemNotif && LocalNotifications) {
              try {
                await LocalNotifications.schedule({
                  notifications: [
                    {
                      id: Math.floor(Math.random() * 2_147_483_647),
                      title:
                        data.title ||
                        (isCall
                          ? "Incoming Call 📞"
                          : isMissedCall
                            ? "Missed Call 📞"
                            : "Notification"),
                      body:
                        data.body ||
                        (isCall
                          ? "Tap to answer"
                          : isMissedCall
                            ? "Tap to view chat"
                            : ""),
                      extra: data,
                      smallIcon: "ic_stat_icon_config_sample",
                      channelId: isCall ? "incoming_calls" : "default",
                      // Action category: incoming → Accept/Decline/Snooze;
                      // missed → just "View chat".
                      ...(isCall
                        ? { actionTypeId: "INCOMING_CALL" }
                        : isMissedCall
                          ? { actionTypeId: "MISSED_CALL" }
                          : {}),
                      // Use the ring pattern for calls, single 200ms buzz otherwise
                      ...(platform === "android"
                        ? {
                            // @capacitor/local-notifications passes these through
                            // to NotificationCompat.Builder.
                            // For older Android versions without channel sounds.
                            ongoing: isCall,
                            autoCancel: !isCall,
                          }
                        : {}),
                    },
                  ],
                });
              } catch (err) {
                console.warn("Local notification fallback failed:", err);
              }
            }
          }
        );

        // Shared handler for Accept / Mute / Decline action taps. Used by
        // both the LocalNotifications listener (Android foreground fallback)
        // and the PushNotifications listener (iOS APNs categories + Android
        // system push), so the flow is identical across platforms.
        const handleCallAction = async (
          actionId: string,
          rawData: Record<string, unknown> | undefined,
        ): Promise<boolean> => {
          const data = (rawData || {}) as Record<string, string>;
          let callId = data.call_id || "";
          let convId = data.conversation_id || "";

          // Cold-start fallback: if the OS delivered the action without
          // the original extras, recover ids from localStorage.
          if (!callId || !convId) {
            const latest = readLatestCall();
            if (latest) {
              if (!callId) callId = latest.call_id;
              if (!convId) convId = latest.conversation_id;
            }
          }

          if (actionId === "accept") {
            logCallEvent(callId, "accepted", { source: "notification_action" });
            clearSnoozeTimer();
            // Dismiss the incoming-call notification so it doesn't linger on
            // top of the in-call overlay after the user has answered.
            try { await LocalNotifications?.removeAllDeliveredNotifications(); } catch { /* ignore */ }
            // Keep latest_call_v1 around briefly so the post-reload auto-accept
            // can hydrate caller name/avatar before we strip the URL params.
            if (convId && typeof window !== "undefined") {
              window.location.href = `/messages/${convId}?call_id=${encodeURIComponent(callId)}&auto_accept=1`;
            }
            return true;
          }

          // "View chat" — silences any active ring and opens the conversation
          // thread. For an incoming-call notification we mark the link as
          // missed (the user explicitly chose not to answer); for a missed-
          // call notification we open the thread directly.
          if (actionId === "view_chat") {
            stopForegroundCallRing();
            clearSnoozeTimer();
            clearLatestCall();
            const isFromIncoming = data.type === "incoming_call";
            logCallEvent(callId, "viewed_chat", {
              source: "notification_action",
              from: isFromIncoming ? "incoming_call" : "missed_call",
            });
            if (convId && typeof window !== "undefined") {
              const param = isFromIncoming ? "incoming_call_id" : "missed_call_id";
              const suffix = callId
                ? `?${param}=${encodeURIComponent(callId)}`
                : "";
              window.location.href = `/messages/${convId}${suffix}`;
            }
            return true;
          }

          // "mute" (legacy default) and "snooze_10s" / "snooze_1m" / "snooze_5m"
          // are all local-only silences with different re-ring delays.
          const isSnoozeAction =
            actionId === "mute" || actionId in SNOOZE_OPTIONS_MS;
          if (isSnoozeAction) {
            const durationMs =
              SNOOZE_OPTIONS_MS[actionId] ?? SNOOZE_MS;

            // LOCAL-ONLY: never invoke an edge function, never write to
            // dm_calls, never notify the caller — from their side the call
            // keeps ringing exactly as before. We snapshot the current call
            // status purely for analytics.
            stopForegroundCallRing();
            let callStatus: string | null = null;
            if (callId) {
              try {
                const { data: row } = await supabase
                  .from("dm_calls")
                  .select("status")
                  .eq("id", callId)
                  .maybeSingle();
                callStatus = (row as { status?: string } | null)?.status ?? null;
              } catch {
                // analytics-only; ignore lookup failures
              }
            }
            logCallEvent(callId, "muted", {
              source: "notification_action",
              action_id: actionId,
              local_only: true,
              call_status: callStatus,
              duration_ms: durationMs,
            });
            // Only re-arm if the call hasn't already left the ringing state.
            if (!callStatus || callStatus === "ringing") {
              scheduleSnoozeRearm(callId, durationMs);
            }
            try {
              window.dispatchEvent(
                new CustomEvent("dm-call-action", {
                  detail: {
                    action: "mute",
                    action_id: actionId,
                    call_id: callId,
                    snooze_ms: durationMs,
                    call_status: callStatus,
                    local_only: true,
                  },
                }),
              );
            } catch { /* ignore */ }
            return true;
          }

          if (actionId === "decline") {
            logCallEvent(callId, "declined", { source: "notification_action" });
            clearSnoozeTimer();
            clearLatestCall();
            if (callId) {
              try {
                await supabase.functions.invoke("dm-call-token", {
                  body: { action: "decline", call_id: callId },
                });
              } catch (err) {
                console.warn("decline RPC failed", err);
              }
            }
            try {
              window.dispatchEvent(
                new CustomEvent("dm-call-action", {
                  detail: { action: "decline", call_id: callId },
                }),
              );
              window.dispatchEvent(new Event("dm-call-banner-dismissed"));
            } catch { /* ignore */ }
            return true;
          }

          return false;
        };

        const tapSub = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          async (action) => {
            // User tapped — call is being handled, stop ringing.
            stopForegroundCallRing();
            const data = (action.notification.data || {}) as Record<string, unknown>;
            // iOS delivers UNNotificationCategory action taps here with
            // actionId = "accept" | "mute" | "decline" matching the
            // INCOMING_CALL category we registered. Android system pushes
            // use the same listener for category actions.
            const handled = await handleCallAction(action.actionId || "", data);
            if (handled) return;

            // Default tap (no action button) → open the URL if provided
            const url = (data as Record<string, string>).url;
            if (url && typeof window !== "undefined") {
              window.location.href = url;
            }
          }
        );

        // Handle taps on local-notification fallbacks too.
        let lnTapSub: { remove: () => Promise<void> } | null = null;
        if (LocalNotifications) {
          try {
            lnTapSub = await LocalNotifications.addListener(
              "localNotificationActionPerformed",
              async (action) => {
                stopForegroundCallRing();
                const data = (action.notification.extra || {}) as Record<string, unknown>;
                const handled = await handleCallAction(action.actionId || "", data);
                if (handled) return;

                // Default tap (no action button) → open the URL if provided
                const url = (data as Record<string, string>).url;
                if (url && typeof window !== "undefined") {
                  window.location.href = url;
                }
              }
            );
          } catch {
            // ignore
          }
        }

        cleanup = () => {
          regSub.remove();
          errSub.remove();
          recvSub.remove();
          tapSub.remove();
          lnTapSub?.remove();
          stopForegroundCallRing();
        };
      } catch (err) {
        // Plugin not installed on this build — safely ignore.
        console.debug("Native push unavailable:", err);
      }
    })();

    return () => {
      cleanup?.();
    };
  }, [user]);
};

// Re-exported for callers (e.g. IncomingCallBanner) that want to silence the
// foreground ring after the user accepts/declines.
export { stopForegroundCallRing, CALL_RING_PATTERN };
