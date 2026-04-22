// Handles deep links from the Android IncomingCallActivity (opoll://call/accept?call_id=…&conversation_id=…)
// On web/PWA this hook is a no-op.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const useCallDeepLink = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");

        const handler = (event: { url: string }) => {
          try {
            const url = new URL(event.url);
            if (url.protocol !== "opoll:") return;
            // opoll://call/accept?call_id=...&conversation_id=...
            const host = url.hostname; // "call"
            const path = url.pathname;  // "/accept"
            if (host === "call" && path.startsWith("/accept")) {
              const callId = url.searchParams.get("call_id") ?? "";
              const convId = url.searchParams.get("conversation_id") ?? "";
              if (convId) {
                navigate(
                  `/messages/${convId}?call_id=${encodeURIComponent(callId)}&auto_accept=1`,
                );
              }
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
