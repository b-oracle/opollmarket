import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
if ("serviceWorker" in navigator) {
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

createRoot(document.getElementById("root")!).render(<App />);
