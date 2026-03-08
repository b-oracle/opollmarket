import { useState, useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const REMIND_AFTER_MS = 5 * 60 * 1000; // Re-show after 5 minutes if dismissed

export const usePWAUpdate = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 30 seconds
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 30 * 1000);
      }
    },
  });

  useEffect(() => {
    if (needRefresh) setShowUpdate(true);
  }, [needRefresh]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

  const update = () => {
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    updateServiceWorker(true);
    setShowUpdate(false);
  };

  const dismiss = () => {
    setShowUpdate(false);
    // Re-show after delay if still needs refresh
    if (needRefresh) {
      dismissTimeoutRef.current = setTimeout(() => {
        setShowUpdate(true);
      }, REMIND_AFTER_MS);
    }
  };

  return { showUpdate, update, dismiss };
};
