import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import {
  startIncomingCallVibration,
  stopVibration,
  vibrate,
  CALL_RING_PATTERN,
} from "@/lib/haptics";

// Tracks the active foreground-call vibration cancel function so we can stop
// it when the user accepts/declines or when the call FCM "ended" arrives.
let activeCallVibrationCancel: (() => void) | null = null;

const stopForegroundCallRing = () => {
  if (activeCallVibrationCancel) {
    activeCallVibrationCancel();
    activeCallVibrationCancel = null;
  }
  stopVibration();
};

if (typeof window !== "undefined") {
  // The IncomingCallBanner fires this when the user accepts/declines or the
  // banner auto-dismisses, so we don't double-buzz the device.
  window.addEventListener("dm-call-banner-dismissed", stopForegroundCallRing);
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
                    { id: "mute", title: "Mute" },
                    { id: "decline", title: "Decline", destructive: true },
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
            const isCallEnded =
              data.type === "call_ended" ||
              data.type === "call_declined" ||
              data.type === "call_missed";

            // Stop any prior ring loop if a call lifecycle event arrives.
            if (isCallEnded) {
              stopForegroundCallRing();
              return;
            }

            if (isCall) {
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
                        (isCall ? "Incoming Call 📞" : "Notification"),
                      body:
                        data.body ||
                        (isCall ? "Tap to answer" : ""),
                      extra: data,
                      smallIcon: "ic_stat_icon_config_sample",
                      channelId: isCall ? "incoming_calls" : "default",
                      // Show Accept / Decline buttons on incoming-call notifications
                      ...(isCall ? { actionTypeId: "INCOMING_CALL" } : {}),
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

        const tapSub = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            // User tapped — call is being handled, stop ringing.
            stopForegroundCallRing();
            const data = action.notification.data || {};
            const url = (data as any).url;
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
                const data = (action.notification.extra || {}) as Record<string, string>;
                const callId = data.call_id || "";
                const convId = data.conversation_id || "";
                const actionId = action.actionId;

                // Accept button → navigate to chat with auto_accept flag
                if (actionId === "accept") {
                  if (convId && typeof window !== "undefined") {
                    window.location.href = `/messages/${convId}?call_id=${encodeURIComponent(callId)}&auto_accept=1`;
                  }
                  return;
                }

                // Decline button → fire decline RPC, no navigation
                if (actionId === "decline") {
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
                  } catch {
                    // ignore
                  }
                  return;
                }

                // Default tap (no action button) → open the URL if provided
                const url = (data as any).url;
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
