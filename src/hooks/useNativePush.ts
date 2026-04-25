import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { vibrate } from "@/lib/haptics";

// Registers the device with FCM (Android) / APNs (iOS) via Capacitor,
// stores the token in user_fcm_tokens, and routes foreground notification
// taps into the app. Also surfaces a local notification + vibration when
// data-only call pushes arrive while the app is foregrounded (the native
// lockscreen UI handles the killed-app case, see android-native-ref/).
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

        const { PushNotifications } = await import("@capacitor/push-notifications");

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive !== "granted") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        // Also request local-notification permission (used as foreground
        // fallback for data-only call pushes).
        let LocalNotifications: typeof import("@capacitor/local-notifications").LocalNotifications | null = null;
        try {
          const mod = await import("@capacitor/local-notifications");
          LocalNotifications = mod.LocalNotifications;
          const lnPerm = await LocalNotifications.checkPermissions();
          if (lnPerm.display !== "granted") {
            await LocalNotifications.requestPermissions();
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
                platform: Capacitor.getPlatform(),
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

        // Build a stable 31-bit notification ID so retried/duplicate FCM
        // deliveries collapse onto the SAME tray entry instead of stacking.
        // Android requires a positive 32-bit signed int; we hash any string
        // identifier (call_id, message_id, push_id) into that range.
        const stableNotificationId = (key: string): number => {
          let h = 0;
          for (let i = 0; i < key.length; i++) {
            h = ((h << 5) - h + key.charCodeAt(i)) | 0;
          }
          // Force positive in 31-bit range; reserve 0 as a sentinel for "no key".
          const positive = Math.abs(h) % 2_147_483_646;
          return positive === 0 ? 1 : positive;
        };

        // Tracks call IDs we've already shown a fallback notification for in
        // this session so duplicate FCM deliveries (carrier retries, multi-
        // device fan-out) don't double-buzz.
        const shownCallIds = new Set<string>();

        // Foreground push received — surface a banner notification + buzz.
        // For incoming-call data pushes we additionally trigger a strong
        // vibration so the user notices even if the app is silent.
        const recvSub = await PushNotifications.addListener(
          "pushNotificationReceived",
          async (notification) => {
            try {
              const data = (notification.data || {}) as Record<string, string>;
              const isCall =
                data.type === "incoming_call" || data.is_call === "true" || data.is_call === "1";

              // Dedupe per call: same call_id should only ring once per session.
              const callKey = data.call_id || data.room_name || data.conversation_id || "";
              if (isCall && callKey && shownCallIds.has(callKey)) {
                return;
              }
              if (isCall && callKey) shownCallIds.add(callKey);

              if (isCall) {
                try {
                  void vibrate([500, 500, 500, 500, 500]);
                } catch (vErr) {
                  console.warn("Call vibrate failed:", vErr);
                }
              }

              // If FCM didn't render a system notification (data-only payload),
              // fall back to a local one so it appears in the tray + buzzes.
              const hasSystemNotif = !!notification.title || !!notification.body;
              if (!hasSystemNotif && LocalNotifications) {
                // Deterministic ID derived from a stable key so retries collapse.
                const idKey =
                  callKey ||
                  data.notification_id ||
                  data.push_id ||
                  data.message_id ||
                  notification.id ||
                  `${data.type || "notif"}:${data.url || ""}`;
                const notifId = stableNotificationId(String(idKey));

                try {
                  await LocalNotifications.schedule({
                    notifications: [
                      {
                        id: notifId,
                        title: data.title || (isCall ? "Incoming Call 📞" : "Notification"),
                        body: data.body || (isCall ? "Tap to answer" : ""),
                        extra: data,
                        smallIcon: "ic_stat_icon_config_sample",
                        channelId: isCall ? "incoming_calls" : "default",
                      },
                    ],
                  });
                } catch (err) {
                  console.warn("Local notification fallback failed:", err, { notifId, idKey });
                }
              }
            } catch (outerErr) {
              // Never let a malformed payload kill the push listener.
              console.warn("pushNotificationReceived handler error:", outerErr);
            }
          }
        );

        const tapSub = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
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
              (action) => {
                const data = action.notification.extra || {};
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
