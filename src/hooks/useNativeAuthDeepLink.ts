import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const isAuthCallbackUrl = (urlString: string) => {
  try {
    const url = new URL(urlString);
    return url.protocol === "opoll:" && url.hostname === "auth" && url.pathname.startsWith("/callback");
  } catch {
    return false;
  }
};

const getCodeFromUrl = (urlString: string) => {
  try {
    const url = new URL(urlString);
    return url.searchParams.get("code");
  } catch {
    return null;
  }
};

export const useNativeAuthDeepLink = () => {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const [{ App }, { Browser }] = await Promise.all([
          import("@capacitor/app"),
          import("@capacitor/browser"),
        ]);

        const finishNativeOAuth = async (url: string) => {
          if (!isAuthCallbackUrl(url)) return;

          const code = getCodeFromUrl(url);
          await Browser.close().catch(() => {});

          if (!code) {
            console.warn("OAuth callback missing code param");
            return;
          }

          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("Failed to exchange OAuth code", error);
          }
        };

        const sub = await App.addListener("appUrlOpen", (event) => {
          void finishNativeOAuth(event.url);
        });
        cleanup = () => sub.remove();

        const launch = await App.getLaunchUrl();
        if (launch?.url) {
          void finishNativeOAuth(launch.url);
        }
      } catch (error) {
        console.warn("Native OAuth deep-link init failed", error);
      }
    })();

    return () => cleanup?.();
  }, []);
};
