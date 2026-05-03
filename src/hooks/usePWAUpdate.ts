import { useEffect, useRef, useState, useCallback } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { cleanupBlockedPwaContext, isPwaBlockedContext } from "@/lib/pwa";

const DISMISSED_SW_KEY = "opoll_sw_dismissed_version";
const APPLIED_SW_KEY = "opoll_sw_applied_version";
const UPDATE_COOLDOWN_KEY = "opoll_sw_update_cooldown";
const SESSION_UPDATED_KEY = "opoll_sw_updated_this_session";
const UPDATE_POLL_MS = 10 * 60 * 1000;
// Suppress new update prompts for 6h after the user applies an update,
// to prevent loops where each reload finds a newly-built sw.js.
const POST_UPDATE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

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
  const blockedContext = isPwaBlockedContext();

  const shouldPromptForWorker = useCallback(
    (candidate: ServiceWorker, registration: ServiceWorkerRegistration): boolean => {
      if (blockedContext) return false;

      // Cooldown: suppress prompts after an update was applied (loop guard)
      const cooldownUntil = safeStorage.getLocal(UPDATE_COOLDOWN_KEY);
      if (cooldownUntil && Date.now() < Number(cooldownUntil)) return false;

      // Only allow one update prompt per browser session to prevent loops
      if (safeStorage.getSession(SESSION_UPDATED_KEY) === "1") return false;

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
    [blockedContext]
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

      if (blockedContext) {
        waitingVersionRef.current = null;
        setWaitingSW(null);
        setShowUpdate(false);
        void cleanupBlockedPwaContext();
        return;
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

        // Skip the immediate post-boot update check — it was the main loop
        // trigger after a reload. The 10-min poll + visibilitychange handler
        // still pick up genuine updates without re-prompting on every reload.
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  // Check for updates on visibility change — NO auto-reload on controllerchange.
  // The old `controllerchange` → `window.location.reload()` listener was the root
  // cause of infinite reload loops: a new SW could activate (via skipWaiting from
  // another tab, or the SW itself), triggering a reload that re-checked for updates,
  // found another waiting worker, and looped. With `registerType: 'prompt'`, the
  // user should always control when the reload happens via the "Update" button.
  useEffect(() => {
    if (blockedContext) {
      waitingVersionRef.current = null;
      setShowUpdate(false);
      setWaitingSW(null);
      void cleanupBlockedPwaContext();
      return;
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        registrationRef.current?.update();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);

      if (registrationRef.current && updateFoundHandlerRef.current) {
        registrationRef.current.removeEventListener("updatefound", updateFoundHandlerRef.current);
      }

      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [blockedContext]);

  const update = useCallback(() => {
    if (blockedContext) return;

    const waitingVersion = getWorkerVersion(waitingSW);

    setShowUpdate(false);
    setWaitingSW(null);

    if (waitingVersion) {
      safeStorage.setSession(APPLIED_SW_KEY, waitingVersion);
      if (safeStorage.getLocal(DISMISSED_SW_KEY) === waitingVersion) {
        safeStorage.removeLocal(DISMISSED_SW_KEY);
      }
    }

    // Mark this session so we don't re-prompt after the upcoming reload,
    // and set a long cross-session cooldown to break update loops caused
    // by frequent rebuilds producing a fresh sw.js on every visit.
    safeStorage.setSession(SESSION_UPDATED_KEY, "1");
    safeStorage.setLocal(
      UPDATE_COOLDOWN_KEY,
      String(Date.now() + POST_UPDATE_COOLDOWN_MS)
    );

    if (waitingSW) {
      waitingSW.postMessage({ type: "SKIP_WAITING" });
    }

    // vite-pwa helper performs a single reload once the new SW takes control
    updateServiceWorker(true);
  }, [blockedContext, waitingSW, updateServiceWorker]);

  const dismiss = useCallback(() => {
    if (blockedContext) return;

    const waitingVersion = getWorkerVersion(waitingSW);
    if (waitingVersion) {
      safeStorage.setLocal(DISMISSED_SW_KEY, waitingVersion);
    }

    waitingVersionRef.current = null;
    setShowUpdate(false);
    setWaitingSW(null);
  }, [blockedContext, waitingSW]);

  return { showUpdate, update, dismiss };
};
