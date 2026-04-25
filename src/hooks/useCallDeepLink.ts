// Handles deep links from the Android IncomingCallActivity / notification
// action buttons:
//   opoll://call/accept?call_id=…&conversation_id=…
//   opoll://call/decline?call_id=…&conversation_id=…
// On web/PWA this hook is a no-op.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const useCallDeepLink = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");

        const handler = async (event: { url: string }) => {
          try {
            const url = new URL(event.url);
            if (url.protocol !== "opoll:") return;
            // opoll://call/<action>?call_id=...&conversation_id=...
            const host = url.hostname; // "call"
            const path = url.pathname;  // "/accept" | "/decline"
            if (host !== "call") return;

            const callId = url.searchParams.get("call_id") ?? "";
            const convId = url.searchParams.get("conversation_id") ?? "";

            if (path.startsWith("/accept")) {
              if (convId) {
                navigate(
                  `/messages/${convId}?call_id=${encodeURIComponent(callId)}&auto_accept=1`,
                );
              }
              return;
            }

            if (path.startsWith("/decline")) {
              // Fire the decline RPC immediately — no UI navigation needed.
              // The realtime listener on IncomingCallBanner will receive the
              // status update and dismiss the banner across all devices.
              if (callId) {
                try {
                  await supabase.functions.invoke("dm-call-token", {
                    body: { action: "decline", call_id: callId },
                  });
                } catch (declineErr) {
                  console.warn("decline RPC failed", declineErr);
                }
              }
              // Also broadcast so the banner can dismiss instantly even if
              // realtime is briefly disconnected.
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
          } catch (e) {
            console.warn("deep-link parse failed", e);
          }
        };

        const sub = await App.addListener("appUrlOpen", handler);
        cleanup = () => sub.remove();
      } catch (e) {
        console.warn("useCallDeepLink init failed", e);
      }
    })();
    return () => cleanup?.();
  }, [navigate]);
};
