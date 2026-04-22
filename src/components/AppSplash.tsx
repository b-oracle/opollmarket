import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SESSION_KEY = "opoll_splash_shown_v1";
const DURATION_MS = 1200;

/**
 * In-app animated splash overlay shown once per session on cold boot.
 * Sits above the entire app while the React tree warms up; gives PWA/web
 * users the same "native app" feel as the Capacitor splash on mobile.
 */
const AppSplash = () => {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(SESSION_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // ignore
      }
      setVisible(false);
    }, DURATION_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="app-splash"
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {/* Glow halo */}
          <motion.div
            className="absolute h-64 w-64 rounded-full bg-primary/30 blur-3xl"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.8, 0.5], scale: [0.6, 1.3, 1] }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
          {/* Logo */}
          <motion.img
            src="/logo.png"
            alt="OPOLL"
            className="relative h-24 w-24 object-contain drop-shadow-[0_0_24px_hsl(var(--primary)/0.6)]"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: [0.7, 1.05, 1] }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AppSplash;
