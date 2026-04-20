import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// Registers the device with FCM (Android) / APNs (iOS) via Capacitor,
// stores the token in user_fcm_tokens, and routes foreground notification
// taps into the app. No-op on web.
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

        cleanup = () => {
          regSub.remove();
          errSub.remove();
          tapSub.remove();
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
