import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone } from "lucide-react";

/**
 * Instant "Joining call…" overlay shown the moment a deep-link with
 * `?auto_accept=1&call_id=...` is opened — long before the React tree,
 * realtime subscription, or LiveKit token round-trip finish. Mirrors the
 * native lockscreen Accept feedback so the app never looks frozen.
 *
 * Reads the URL synchronously on mount so it appears in the very first
 * paint after navigation. Dismisses when:
 *   - the active call overlay mounts (`dm-call-overlay-mounted` event)
 *   - the call is declined / cancelled (`dm-call-action` event)
 *   - the auto_accept param disappears from the URL
 *   - a 20s safety timeout elapses
 */
const isJoinDeepLink = (): { active: boolean; callId: string | null } => {
  if (typeof window === "undefined") return { active: false, callId: null };
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      active: params.get("auto_accept") === "1",
      callId: params.get("call_id"),
    };
  } catch {
    return { active: false, callId: null };
  }
};

const CallJoinSplash = () => {
  const [{ active, callId }, setState] = useState(isJoinDeepLink);

  useEffect(() => {
    if (!active) return;

    const dismiss = () => setState({ active: false, callId: null });

    // Active call overlay mounted → drop splash
    const onMounted = () => dismiss();
    // Call cancelled/declined/missed → drop splash
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string } | undefined;
      if (!detail) return;
      if (["decline", "missed", "ended", "failed"].includes(detail.action || "")) {
        dismiss();
      }
    };
    // URL stripped of auto_accept (banner already handled it) → drop splash
    const onPop = () => {
      if (!isJoinDeepLink().active) dismiss();
    };

    window.addEventListener("dm-call-overlay-mounted", onMounted);
    window.addEventListener("dm-call-action", onAction);
    window.addEventListener("popstate", onPop);

    // Poll URL once per second — banner uses history.replaceState which
    // doesn't fire popstate.
    const poll = window.setInterval(() => {
      if (!isJoinDeepLink().active) dismiss();
    }, 1000);

    // Safety net — never trap the user
    const timeout = window.setTimeout(dismiss, 20_000);

    return () => {
      window.removeEventListener("dm-call-overlay-mounted", onMounted);
      window.removeEventListener("dm-call-action", onAction);
      window.removeEventListener("popstate", onPop);
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="call-join-splash"
          className="fixed inset-0 z-[2147483646] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          aria-live="polite"
          role="status"
          data-call-id={callId || undefined}
        >
          <motion.div
            className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary/15"
            initial={{ scale: 0.8 }}
            animate={{ scale: [0.9, 1.05, 0.95] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <Phone className="relative h-10 w-10 text-primary" />
          </motion.div>
          <p className="mt-6 text-base font-medium text-foreground">Joining call…</p>
          <p className="mt-1 text-sm text-muted-foreground">Connecting securely</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CallJoinSplash;
