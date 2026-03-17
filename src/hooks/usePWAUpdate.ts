import { useState, useEffect, useRef, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const DISMISSED_KEY = "opoll_pwa_update_dismissed";
const APPLIED_SW_KEY = "opoll_pwa_applied_sw";

export const usePWAUpdate = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const intervalRef = useRef<number | null>(null);

  const getWaitingScriptUrl = useCallback(() => {
    return registrationRef.current?.waiting?.scriptURL ?? null;
  }, []);

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

    const dismissed = sessionStorage.getItem(DISMISSED_KEY);
    const appliedScriptUrl = localStorage.getItem(APPLIED_SW_KEY);
    const waitingScriptUrl = getWaitingScriptUrl();
    const alreadyAppliedVersion = waitingScriptUrl && appliedScriptUrl === waitingScriptUrl;

    if (!dismissed && !alreadyAppliedVersion) {
      setShowUpdate(true);
    }
  }, [needRefresh, getWaitingScriptUrl]);

  const update = () => {
    const waitingScriptUrl = getWaitingScriptUrl();

    if (waitingScriptUrl) {
      localStorage.setItem(APPLIED_SW_KEY, waitingScriptUrl);
    }

    // prevent re-prompt loops in current session if activation/reload is delayed
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setShowUpdate(false);
    updateServiceWorker(true);
  };

  const dismiss = () => {
    setShowUpdate(false);
    // Don't re-show for this entire session
    sessionStorage.setItem(DISMISSED_KEY, "1");
  };

  return { showUpdate, update, dismiss };
};
