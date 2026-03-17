import { useState, useEffect, useRef, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const DISMISSED_KEY = "opoll_pwa_update_dismissed";
const UPDATED_AT_KEY = "opoll_pwa_updated_at";
const UPDATE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes after clicking Update

export const usePWAUpdate = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const intervalRef = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Check for updates every 2 minutes
      if (registration) {
        intervalRef.current = window.setInterval(() => {
          if (document.visibilityState === "visible") {
            registration.update();
          }
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
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkForUpdates]);

  useEffect(() => {
    if (!needRefresh) return;

    // Don't show if dismissed this session
    const dismissed = sessionStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;

    // Don't show if user recently clicked "Update" (within cooldown)
    const updatedAt = localStorage.getItem(UPDATED_AT_KEY);
    if (updatedAt) {
      const elapsed = Date.now() - parseInt(updatedAt, 10);
      if (elapsed < UPDATE_COOLDOWN_MS) return;
    }

    setShowUpdate(true);
  }, [needRefresh]);

  const update = () => {
    // Record the time the user clicked Update — suppress prompt for cooldown period
    localStorage.setItem(UPDATED_AT_KEY, Date.now().toString());
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShowUpdate(false);
    updateServiceWorker(true);
  };

  const dismiss = () => {
    setShowUpdate(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  };

  return { showUpdate, update, dismiss };
};
