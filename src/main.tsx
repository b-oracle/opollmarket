import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { cleanupBlockedPwaContext, isPwaBlockedContext } from "./lib/pwa";

const PREVIEW_SW_CLEANUP_KEY = "opoll_preview_sw_cleanup_v1";
const PREVIEW_SW_RELOAD_KEY = "opoll_preview_sw_reload_v1";

// Service workers break Lovable preview/iframe sessions by serving stale assets.
// Clean up any old registrations silently — DO NOT reload, since iframe
// sessionStorage can be cleared between reloads, causing infinite loops.
if (typeof window !== "undefined") {
  void (async () => {
    if (!isPwaBlockedContext()) return;
    try {
      await cleanupBlockedPwaContext();
    } catch {
      // ignore
    }
  })();
}

// Break orphaned Web Locks left by supabase-js auth (known deadlock issue).
// The auth client uses navigator.locks to serialize token refresh; if a lock
// holder is killed (tab background, PWA process kill, React Strict Mode) the
// lock is never released and every subsequent Supabase call hangs forever.
// Stealing the lock with { steal: true } forcibly releases the orphan so the
// client can proceed normally.
try {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (projectId && typeof navigator !== "undefined" && navigator.locks) {
    const lockName = `sb-${projectId}-auth-token`;
    // steal: true forcibly takes the lock from any holder, then we release immediately
    navigator.locks.request(lockName, { steal: true }, () => {
      // Lock acquired — return immediately to release it
      return Promise.resolve();
    }).catch(() => {
      // Locks API not supported or errored — ignore
    });
  }
} catch {
  // Ignore
}

// Recover from malformed persisted auth token that can break boot in production
try {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (projectId) {
    const authKey = `sb-${projectId}-auth-token`;
    const raw = localStorage.getItem(authKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const accessToken = parsed?.access_token;
        if (typeof accessToken !== "string" || accessToken.split(".").length !== 3) {
          localStorage.removeItem(authKey);
        }
      } catch {
        localStorage.removeItem(authKey);
      }
    }
  }
} catch {
  // Ignore storage access errors
}

// Force a SW update check on boot to minimize stale published caches
if (!isPwaBlockedContext() && "serviceWorker" in navigator) {
  // Only check for SW updates if the page is visible and online;
  // aggressive checks on every boot contributed to reload loops.
  if (document.visibilityState === "visible" && navigator.onLine) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)))
      )
      .catch(() => undefined);
  }
}

// Prevent browser edge-swipe navigation (back/forward) while preserving vertical scroll
const EDGE_THRESHOLD = 30;
document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  if (touch.clientX < EDGE_THRESHOLD || touch.clientX > window.innerWidth - EDGE_THRESHOLD) {
    const startX = touch.clientX;
    const startY = touch.clientY;
    let decided = false;
    let shouldBlock = false;
    const onMove = (ev: TouchEvent) => {
      if (!decided) {
        const dx = Math.abs(ev.touches[0].clientX - startX);
        const dy = Math.abs(ev.touches[0].clientY - startY);
        if (dx > 5 || dy > 5) {
          decided = true;
          shouldBlock = dx > dy; // only block horizontal swipes
        }
      }
      if (shouldBlock) ev.preventDefault();
    };
    const cleanup = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', cleanup);
      document.removeEventListener('touchcancel', cleanup);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', cleanup);
    document.addEventListener('touchcancel', cleanup);
  }
}, { passive: true });

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<App />);

// One-time blank-screen recovery: if app failed to mount any UI, clear stale SW/cache and reload.
// DISABLED inside the Lovable preview iframe — sessionStorage can be cleared between
// reloads there, causing infinite refresh loops.
if (!isPwaBlockedContext()) {
  window.setTimeout(async () => {
    const hasMountedContent =
      rootElement.childElementCount > 0 ||
      (rootElement.textContent?.trim().length ?? 0) > 0;

    if (hasMountedContent) return;

    let attempts = 0;
    try {
      attempts = Number(window.sessionStorage?.getItem("boot_recovery") || "0");
    } catch {
      attempts = 0;
    }

    if (attempts >= 1) return;

    try {
      window.sessionStorage?.setItem("boot_recovery", String(attempts + 1));
    } catch {
      // ignore storage errors
    }

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore cleanup failures
    }

    window.location.reload();
  }, 5000);
}
