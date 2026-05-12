// FsiPermissionBanner — shown to Android 14+ users whose device has the
// "Allow full-screen notifications" toggle OFF. Without this permission,
// the lockscreen incoming-call UI (CallStyle.forIncomingCall) is silently
// demoted by the OS and the call channel only buzzes once before
// disappearing. The native MainActivity dispatches `fsi-permission-status`
// from onCreate / onResume — we listen and surface a one-tap CTA that
// deep-links into the per-app setting.
//
// Web / iOS / Android < 14: this component renders nothing.

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const DISMISS_KEY = "fsi_banner_dismissed_until_v1";
const DISMISS_HOURS = 24;

export default function FsiPermissionBanner() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedUntil > Date.now()) setDismissed(true);

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const value = typeof detail === "string"
        ? (() => { try { return JSON.parse(detail); } catch { return {}; } })()
        : detail || {};
      if (typeof value?.granted === "boolean") setGranted(value.granted);
    };
    window.addEventListener("fsi-permission-status", handler);
    return () => window.removeEventListener("fsi-permission-status", handler);
  }, []);

  const openSettings = async () => {
    try {
      const { Capacitor, registerPlugin } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const FsiPermission = registerPlugin<{ openSettings: () => Promise<void> }>("FsiPermission");
      await FsiPermission.openSettings();
    } catch (err) {
      console.warn("[fsi-banner] openSettings failed:", err);
    }
  };

  const dismiss = () => {
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + DISMISS_HOURS * 60 * 60 * 1000),
    );
    setDismissed(true);
  };

  if (granted !== false || dismissed) return null;

  return (
    <div
      role="alert"
      className="fixed left-2 right-2 z-[60] rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100 backdrop-blur-md shadow-lg"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="flex-1">
          <p className="font-semibold leading-tight">Enable lockscreen calls</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Android needs permission to show incoming calls over the lockscreen.
            Without it, calls only vibrate briefly and disappear.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={openSettings}
              className="rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-300"
            >
              Open settings
            </button>
            <button
              onClick={dismiss}
              className="rounded-md border border-amber-400/40 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-400/10"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-amber-100/60 hover:text-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
