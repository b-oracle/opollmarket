/**
 * Aimtell SDK helper – manages initialisation, opt-in prompt, and
 * subscriber attribute / event tagging.
 *
 * Site ID and owner are embedded in index.html's inline script; this
 * module wraps the global `_at` object the SDK exposes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    _at: {
      track: (...args: any[]) => void;
      owner?: string;
      idSite?: string;
      attributes?: Record<string, string>;
      cmd?: Array<() => void>;
    };
    _aimtellSubscriberLookup?: any;
  }
}

// ---------- helpers ----------

/** Queue a command that runs once the Aimtell SDK is fully loaded. */
function queueCmd(fn: () => void) {
  window._at = window._at || ({} as any);
  window._at.cmd = window._at.cmd || [];
  window._at.cmd.push(fn);
}

// ---------- public API ----------

/**
 * Trigger the native browser push permission prompt via Aimtell.
 * Safe to call multiple times – the SDK deduplicates.
 */
export function aimtellPromptSubscribe() {
  try {
    queueCmd(() => {
      // The SDK exposes _at.track("optin") to trigger the opt-in
      window._at.track("optin");
    });
  } catch {
    // silent – never break the app for analytics
  }
}

/**
 * Set persistent attributes on the current subscriber.
 * These appear in the Aimtell dashboard and can be used for segmentation.
 */
export function aimtellSetAttributes(attrs: Record<string, string | number | boolean>) {
  try {
    window._at = window._at || ({} as any);
    window._at.attributes = window._at.attributes || {};
    Object.entries(attrs).forEach(([k, v]) => {
      window._at.attributes![k] = String(v);
    });
  } catch {
    // silent
  }
}

/**
 * Fire a custom event/tag so the subscriber gets bucketed in Aimtell's
 * segment builder (e.g. "quick-trade", "prediction", "deposit").
 */
export function aimtellTrackEvent(eventName: string) {
  try {
    window._at.track(eventName);
  } catch {
    // silent
  }
}

/**
 * Tag the current subscriber with the authenticated user's info.
 * Call once after login / on app load when user is available.
 */
export function aimtellIdentifyUser(userId: string, email?: string | null, displayName?: string | null) {
  const attrs: Record<string, string> = { user_id: userId };
  if (email) attrs.email = email;
  if (displayName) attrs.display_name = displayName;
  aimtellSetAttributes(attrs);
}
