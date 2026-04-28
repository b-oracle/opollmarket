// Handles deep links from the Android IncomingCallActivity / notification
// action buttons:
//   opoll://call/accept?call_id=…&conversation_id=…
//   opoll://call/decline?call_id=…&conversation_id=…
// On web/PWA this hook is a no-op.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
              let declineOk = false;
              let declineErrMsg: string | null = null;
              if (callId) {
                try {
                  const { error } = await supabase.functions.invoke("dm-call-token", {
                    body: { action: "decline", call_id: callId },
                  });
                  if (error) {
                    declineErrMsg = error.message || "decline_failed";
                    console.warn("decline RPC returned error", error);
                  } else {
                    declineOk = true;
                  }
                } catch (declineErr: any) {
                  declineErrMsg = declineErr?.message || "decline_failed";
                  console.warn("decline RPC failed", declineErr);
                }
              } else {
                declineErrMsg = "missing_call_id";
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
              // Local confirmation so the user knows the tap registered, even
              // when the deep link arrived with the app in the background.
              try {
                if (declineOk) {
                  toast.success("Call declined");
                } else {
                  toast.error("Couldn't decline the call", {
                    description:
                      declineErrMsg === "missing_call_id"
                        ? "The notification was missing call info."
                        : "Please try again from the chat.",
                  });
                }
              } catch {
                // toast unavailable — non-fatal
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
