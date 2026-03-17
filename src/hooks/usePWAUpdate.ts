import { useState, useEffect, useRef, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const DISMISSED_KEY = "opoll_pwa_update_dismissed";

export const usePWAUpdate = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;

      // Check for updates every 2 minutes
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 2 * 60 * 1000);
      }
    },
  });

  // Check on visibility change
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
      // Only show if not recently dismissed
      const dismissed = sessionStorage.getItem(DISMISSED_KEY);
      if (!dismissed) {
        setShowUpdate(true);
      }
    }
  }, [needRefresh]);

  const update = () => {
    sessionStorage.removeItem(DISMISSED_KEY);
    updateServiceWorker(true);
    setShowUpdate(false);
  };

  const dismiss = () => {
    setShowUpdate(false);
    // Don't re-show for this entire session
    sessionStorage.setItem(DISMISSED_KEY, "1");
  };

  return { showUpdate, update, dismiss };
};
