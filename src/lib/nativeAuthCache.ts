// Mirrors the Supabase access token into Capacitor Preferences so the native
// Android CallActionReceiver can hit the dm-call-token edge function with a
// valid Authorization header even when the webview isn't running (e.g. user
// taps "Decline" on the lockscreen notification with the app killed).
//
// On web this is a no-op. On native we write on every auth state change and
// clear on sign-out so a stale token can't be replayed.
import { supabase } from "@/integrations/supabase/client";

const TOKEN_KEY = "supabase_access_token";

let initialized = false;

const writeToken = async (token: string | null) => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Preferences } = await import("@capacitor/preferences");
    if (token) {
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } else {
      await Preferences.remove({ key: TOKEN_KEY });
    }
  } catch (err) {
    // Preferences plugin not installed in this build — non-fatal, the
    // realtime banner timeout will still mark missed calls eventually.
    console.debug("[nativeAuthCache] write failed:", err);
  }
};

export const initNativeAuthCache = () => {
  if (initialized) return;
  initialized = true;

  // Seed with the current session immediately.
  void supabase.auth.getSession().then(({ data }) => {
    void writeToken(data.session?.access_token ?? null);
  });

  // Keep in sync on every auth event (sign-in, refresh, sign-out).
  supabase.auth.onAuthStateChange((_event, session) => {
    void writeToken(session?.access_token ?? null);
  });
};
