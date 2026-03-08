import { useState, useEffect, useRef, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const REMIND_AFTER_MS = 2 * 60 * 1000; // Re-show after 2 minutes if dismissed

export const usePWAUpdate = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;
      
      // Check for updates every 30 seconds
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 30 * 1000);
      }
    },
  });

  // Check for updates when page becomes visible (user returns to app)
  const checkForUpdates = useCallback(() => {
    registrationRef.current?.update();
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [checkForUpdates]);

  useEffect(() => {
    if (needRefresh) {
      setShowUpdate(true);
      // Clear any pending reminder since we're showing now
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    }
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
