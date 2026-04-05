import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { aimtellPromptSubscribe } from "@/lib/aimtell";

import { useCommissionSettings } from "@/hooks/useCommissionSettings";

const STORAGE_KEY = "aimtell_prompt_cooldown_until";
const SESSION_KEY = "aimtell_prompt_seen_session";

const isStandaloneDisplay = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

const supportsWebPush = () => {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  if (!("Notification" in window)) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;

  // iOS requires the app to run as an installed web app for push support.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && !isStandaloneDisplay()) return false;

  return true;
};

const setPromptCooldown = (cooldownDays: number) => {
  try {
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_KEY, String(Date.now() + cooldownMs));
  } catch {
    // ignore storage failures
  }
};

/**
 * Custom styled "soft ask" prompt for push notifications.
 * Shows after a delay, matching the app's glassmorphism UI.
 * If accepted → fires Aimtell's native permission flow.
 * If dismissed → hides for 7 days.
 */
const AimtellPushPrompt = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!supportsWebPush()) return;

    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return;
      const cooldownUntil = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
      if (Number.isFinite(cooldownUntil) && cooldownUntil > Date.now()) return;
    } catch {
      // ignore storage failures
    }

    // Prompt only when browser has not already decided.
    if (Notification.permission !== "default") return;

    const timer = setTimeout(() => {
      setVisible(true);
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // ignore
      }
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  const handleAccept = () => {
    setVisible(false);
    setPromptCooldown();
    aimtellPromptSubscribe();
  };

  const handleDismiss = () => {
    setVisible(false);
    setPromptCooldown();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: "spring", damping: 24, stiffness: 260 }}
          className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-[60]"
        >
          <div className="glass-strong rounded-2xl p-4 shadow-2xl border border-border/40 relative overflow-hidden">
            {/* Accent glow */}
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-primary/20 blur-2xl pointer-events-none" />

            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-lg hover:bg-muted/60 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-semibold text-foreground leading-tight">
                  Stay in the loop
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Get instant alerts for market results, payouts, and trending predictions.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-3.5">
              <button
                onClick={handleDismiss}
                className="flex-1 text-xs font-medium py-2 px-3 rounded-xl bg-muted/60 text-muted-foreground hover:bg-muted transition-colors active:scale-[0.97]"
              >
                Not now
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 text-xs font-bold py-2 px-3 rounded-xl bg-primary text-primary-foreground hover:brightness-110 transition-all active:scale-[0.97] shadow-[0_0_16px_hsl(var(--primary)/0.3)]"
              >
                Enable alerts
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AimtellPushPrompt;
