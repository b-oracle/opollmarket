import { useEffect, useRef, useState, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const DISMISSED_SW_KEY = "opoll_sw_dismissed_version";
const APPLIED_SW_KEY = "opoll_sw_applied_version";
const UPDATE_POLL_MS = 10 * 60 * 1000;

const getWorkerVersion = (worker: ServiceWorker | null | undefined): string | null => {
  return worker?.scriptURL ?? null;
};

const safeStorage = {
  getLocal(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setLocal(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore storage errors
    }
  },
  removeLocal(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  },
  getSession(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setSession(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // ignore storage errors
    }
  },
  removeSession(key: string) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  },
};

export const usePWAUpdate = () => {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const intervalRef = useRef<number | null>(null);
  const updateFoundHandlerRef = useRef<((event: Event) => void) | null>(null);
  const waitingVersionRef = useRef<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  const shouldPromptForWorker = useCallback(
    (candidate: ServiceWorker, registration: ServiceWorkerRegistration): boolean => {
      const candidateVersion = getWorkerVersion(candidate);
      if (!candidateVersion) return false;

      const activeVersion = getWorkerVersion(registration.active);
      const dismissedVersion = safeStorage.getLocal(DISMISSED_SW_KEY);
      const appliedVersion = safeStorage.getSession(APPLIED_SW_KEY);

      if (candidateVersion === activeVersion) return false;
      if (candidateVersion === dismissedVersion) return false;
      if (candidateVersion === appliedVersion) return false;
      if (candidateVersion === waitingVersionRef.current) return false;

      return true;
    },
    []
  );

  const surfaceWaitingWorker = useCallback(
    (candidate: ServiceWorker, registration: ServiceWorkerRegistration) => {
      if (!shouldPromptForWorker(candidate, registration)) return;

      const candidateVersion = getWorkerVersion(candidate);
      waitingVersionRef.current = candidateVersion;
      setWaitingSW(candidate);
      setShowUpdate(true);
    },
    [shouldPromptForWorker]
  );

  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registrationRef.current && updateFoundHandlerRef.current) {
        registrationRef.current.removeEventListener("updatefound", updateFoundHandlerRef.current);
      }

      registrationRef.current = registration ?? null;

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (registration) {
        const activeVersion = getWorkerVersion(registration.active);
        const appliedVersion = safeStorage.getSession(APPLIED_SW_KEY);
        if (activeVersion && appliedVersion === activeVersion) {
          safeStorage.removeSession(APPLIED_SW_KEY);
        }

        // If a waiting SW is already present on registration, surface the prompt
        if (registration.waiting) {
          surfaceWaitingWorker(registration.waiting, registration);
        }

        // Listen for new service workers that finish installing
        const handleUpdateFound = () => {
          const newSW = registration.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              surfaceWaitingWorker(newSW, registration);
            }
          });
        };

        updateFoundHandlerRef.current = handleUpdateFound;
        registration.addEventListener("updatefound", handleUpdateFound);

        // Check for updates every 10 minutes to avoid re-prompt loops.
        intervalRef.current = window.setInterval(() => {
          if (document.visibilityState === "visible" && navigator.onLine) {
            registration.update();
          }
        }, UPDATE_POLL_MS);

        // Do an immediate update check when app is visible
        if (document.visibilityState === "visible") {
          registration.update();
        }
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

      if (registrationRef.current && updateFoundHandlerRef.current) {
        registrationRef.current.removeEventListener("updatefound", updateFoundHandlerRef.current);
      }

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const update = useCallback(() => {
    const waitingVersion = getWorkerVersion(waitingSW);

    setShowUpdate(false);
    setWaitingSW(null);

    if (waitingVersion) {
      safeStorage.setSession(APPLIED_SW_KEY, waitingVersion);
      if (safeStorage.getLocal(DISMISSED_SW_KEY) === waitingVersion) {
        safeStorage.removeLocal(DISMISSED_SW_KEY);
      }
    }

    if (waitingSW) {
      waitingSW.postMessage({ type: "SKIP_WAITING" });
    }

    // Also call the vite-pwa helper
    updateServiceWorker(true);
  }, [waitingSW, updateServiceWorker]);

  const dismiss = useCallback(() => {
    const waitingVersion = getWorkerVersion(waitingSW);
    if (waitingVersion) {
      safeStorage.setLocal(DISMISSED_SW_KEY, waitingVersion);
    }

    waitingVersionRef.current = null;
    setShowUpdate(false);
    setWaitingSW(null);
  }, [waitingSW]);

  return { showUpdate, update, dismiss };
};
