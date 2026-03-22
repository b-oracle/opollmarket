import { useEffect, useRef, useState, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export const usePWAUpdate = () => {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (registration) {
        // If a waiting SW is already present on registration, surface the prompt
        if (registration.waiting) {
          setWaitingSW(registration.waiting);
          setShowUpdate(true);
        }

        // Listen for new service workers that finish installing
        registration.addEventListener("updatefound", () => {
          const newSW = registration.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingSW(newSW);
              setShowUpdate(true);
            }
          });
        });

        // Check for updates every 60 seconds (more aggressive)
        intervalRef.current = window.setInterval(() => {
          if (document.visibilityState === "visible") {
            registration.update();
          }
        }, 60 * 1000);

        // Also do an immediate update check
        registration.update();
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  // Also check on visibility change + listen for controllerchange to auto-reload
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        registrationRef.current?.update();
      }
    };

    // When a new SW takes over (via skipWaiting), reload the page
    const handleControllerChange = () => {
      window.location.reload();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const update = useCallback(() => {
    setShowUpdate(false);
    if (waitingSW) {
      waitingSW.postMessage({ type: "SKIP_WAITING" });
    }
    // Also call the vite-pwa helper
    updateServiceWorker(true);
  }, [waitingSW, updateServiceWorker]);

  const dismiss = useCallback(() => {
    setShowUpdate(false);
  }, []);

  return { showUpdate, update, dismiss };
};
