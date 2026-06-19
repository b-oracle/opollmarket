import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import React from "react";
import { getCanonicalOrigin } from "@/lib/canonical";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rolesLoaded: boolean;
  displayName: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isSupport: boolean;
  isBusiness: boolean;
  hasAdminAccess: boolean;
  hasBusinessAccess: boolean;
  canEdit: boolean;
  isEmailVerified: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName?: string, username?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isSupport, setIsSupport] = useState(false);
  const [isBusiness, setIsBusiness] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const lastSessionRef = useRef<Session | null>(null);
  const signingOutRef = useRef(false);

  const fetchDisplayName = useCallback(async (userId: string, mounted: { current: boolean }) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      if (mounted.current) setProfileDisplayName(data?.display_name || null);
    } catch {
      // ignore
    }
  }, []);

  const checkRoles = useCallback(async (userId: string, mounted: { current: boolean }) => {
    try {
      const [{ data: superAdminData }, { data: adminData }, { data: modData }, { data: supportData }, { data: businessData }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" as any }),
        supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "moderator" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "support" as any }),
        supabase.rpc("has_role", { _user_id: userId, _role: "business" as any }),
      ]);
      if (mounted.current) {
        setIsSuperAdmin(!!superAdminData);
        setIsAdmin(!!adminData);
        setIsModerator(!!modData);
        setIsSupport(!!supportData);
        setIsBusiness(!!businessData);
        setRolesLoaded(true);
      }
    } catch {
      if (mounted.current) {
        setIsSuperAdmin(false);
        setIsAdmin(false);
        setIsModerator(false);
        setIsSupport(false);
        setIsBusiness(false);
        setRolesLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    const mounted = { current: true };

    // Recover from malformed auth storage that can cause blank-screen startup loops
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
      // ignore storage access issues
    }

    // 1. Set up auth listener FIRST (Supabase recommended order)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted.current) return;

        // Skip recovery if we're intentionally signing out
        if (event === "SIGNED_OUT" && signingOutRef.current) {
          lastSessionRef.current = null;
          setSession(null);
          setUser(null);
          setIsSuperAdmin(false);
          setIsAdmin(false);
          setIsModerator(false);
          setIsSupport(false);
          setIsBusiness(false);
          setRolesLoaded(false);
          setProfileDisplayName(null);
          if (mounted.current) setLoading(false);
          return;
        }

        // If signed out (intentional or not), clear everything — no recovery attempts
        if (event === "SIGNED_OUT") {
          lastSessionRef.current = null;
          setSession(null);
          setUser(null);
          setIsSuperAdmin(false);
          setIsAdmin(false);
          setIsModerator(false);
          setIsSupport(false);
          setIsBusiness(false);
          setRolesLoaded(false);
          setProfileDisplayName(null);
          if (mounted.current) setLoading(false);
          return;
        }

        // Set session state immediately so auth UI never blocks on follow-up queries
        lastSessionRef.current = newSession;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Reset swipe hints on sign-in (but NOT the social tutorial — it should only replay manually)
        if (event === "SIGNED_IN" && newSession?.user) {
          const signedInUserId = newSession.user.id;
          localStorage.removeItem("social_swipe_used");
          localStorage.removeItem("feed_swipe_hint_seen");

          // Recheck verification level in background (catches stale badges)
          supabase.functions.invoke("update-verification").catch(() => {});

          // Non-blocking banned-user check (prevents sign-in promise stalls)
          void (async () => {
            const blockResult = await Promise.race([
              supabase.rpc("am_i_blocked"),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
            ]);

            if (!mounted.current || !blockResult || !("data" in blockResult)) return;
            if (blockResult.data === true) {
              await supabase.auth.signOut();
            }
          })().catch(() => {});
        }

        if (newSession?.user) {
          // Use setTimeout to avoid potential Supabase deadlock during auth callback
          setTimeout(() => {
            if (mounted.current) {
              checkRoles(newSession.user.id, mounted);
              fetchDisplayName(newSession.user.id, mounted);
            }
          }, 0);
        } else {
          setIsSuperAdmin(false);
          setIsAdmin(false);
          setIsModerator(false);
          setIsSupport(false);
          setIsBusiness(false);
          setRolesLoaded(true);
          setProfileDisplayName(null);
        }
        if (mounted.current) setLoading(false);
      }
    );

    // 2. THEN get initial session
    supabase.auth.getSession()
      .then(async ({ data: { session: initialSession } }) => {
        if (!mounted.current) return;
        lastSessionRef.current = initialSession;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          await Promise.all([
            checkRoles(initialSession.user.id, mounted),
            fetchDisplayName(initialSession.user.id, mounted),
          ]);
        }
        if (mounted.current) setLoading(false);
      })
      .catch(() => {
        // Network/parse error — don't sign out, just stop loading
        if (mounted.current) setLoading(false);
      });

    // Re-validate session on foreground
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible" || !mounted.current) return;
      if (!lastSessionRef.current) return; // No session to recover

      try {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (!mounted.current) return;

        if (freshSession) {
          const expiresAt = freshSession.expires_at;
          const fiveMinutesFromNow = Math.floor(Date.now() / 1000) + 300;
          if (expiresAt && expiresAt < fiveMinutesFromNow) {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed.session && mounted.current) {
              lastSessionRef.current = refreshed.session;
              setSession(refreshed.session);
              setUser(refreshed.session.user);
            }
            // If refresh fails, keep current state — don't sign out
            return;
          }
          lastSessionRef.current = freshSession;
          setSession(freshSession);
          setUser(freshSession.user);
        } else {
          // getSession returned null but we had a session — try to refresh
          try {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed.session && mounted.current) {
              lastSessionRef.current = refreshed.session;
              setSession(refreshed.session);
              setUser(refreshed.session.user);
            }
            // If refresh returns null session, keep UI state — the token may
            // still be valid server-side. Only an explicit SIGNED_OUT event
            // from onAuthStateChange should clear the user.
          } catch {
            // Network error during refresh — keep current state
          }
        }
      } catch {
        // Network error — keep current state, don't sign out
      }
    };

    // Proactive refresh every 10 minutes (reduced from 2min to avoid token churn)
    const refreshInterval = setInterval(async () => {
      if (!mounted.current || !lastSessionRef.current) return;
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session && mounted.current) {
          lastSessionRef.current = refreshed.session;
          setSession(refreshed.session);
          setUser(refreshed.session.user);
        }
      } catch {
        // Silently ignore
      }
    }, 10 * 60 * 1000);

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(refreshInterval);
    };
  }, [checkRoles]);

  const signIn = useCallback(async (email: string, password: string) => {
    const SIGN_IN_TIMEOUT_MS = 20000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const signInAttempt = supabase.auth
      .signInWithPassword({ email, password })
      .then(({ error }) => ({ error }))
      .catch((error) => ({
        error: error instanceof Error ? error : new Error("Login failed"),
      }));

    const result = await Promise.race([
      signInAttempt,
      new Promise<{ error: any }>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve({ error: new Error("__TIMEOUT__") });
        }, SIGN_IN_TIMEOUT_MS);
      }),
    ]);

    if (timeoutId) clearTimeout(timeoutId);

    if (result.error) {
      // Recovery path: backend login may have succeeded while client lock was delayed
      for (let i = 0; i < 3; i++) {
        try {
          const { data: { session: recoveredSession } } = await supabase.auth.getSession();
          if (recoveredSession?.user?.email?.toLowerCase() === email.toLowerCase()) {
            localStorage.removeItem("social_swipe_used");
            return { error: null };
          }
          break; // getSession succeeded but no matching session — stop retrying
        } catch {
          if (i < 2) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        }
      }

      // Replace internal marker with user-friendly message
      if (result.error?.message === "__TIMEOUT__") {
        return { error: new Error("Login request timed out. Please try again.") };
      }
    }

    if (!result.error) localStorage.removeItem("social_swipe_used");
    return result;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string, username?: string) => {
    const referredBy = localStorage.getItem("referral_id");
    // Anti-abuse: capture device fingerprint so the signup trigger can detect
    // the same device repeatedly using the same referrer code.
    let signupUa: string | undefined;
    try { signupUa = typeof navigator !== "undefined" ? navigator.userAgent : undefined; } catch { /* ignore */ }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          ...(username ? { username } : {}),
          ...(referredBy ? { referred_by: referredBy } : {}),
          ...(signupUa ? { signup_ua: signupUa } : {}),
        },
        emailRedirectTo: getCanonicalOrigin(),
      },
    });
    if (!error) {
      localStorage.removeItem("referral_id");
    }
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    // Clear security verification so next login re-prompts PIN/TOTP
    if (user?.id) {
      try { localStorage.removeItem(`login_sec_verified_${user.id}`); } catch {}
      try { localStorage.removeItem(`security_ok_${user.id}`); } catch {}
    }
    // Immediately clear all state so UI updates instantly
    signingOutRef.current = true;
    lastSessionRef.current = null;
    setSession(null);
    setUser(null);
    setIsSuperAdmin(false);
    setIsAdmin(false);
    setIsModerator(false);
    setIsSupport(false);
    setIsBusiness(false);
    setRolesLoaded(false);
    setProfileDisplayName(null);

    // Fire-and-forget: attempt global sign-out, fall back to local, never block UI
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]);
    } catch {
      try {
        await Promise.race([
          supabase.auth.signOut({ scope: "local" }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
      } catch {
        // Both timed out — state is already cleared, session cookie will expire
      }
    } finally {
      signingOutRef.current = false;
    }
  }, []);

  const isEmailVerified = !!user?.email_confirmed_at;
  const hasAdminAccess = isSuperAdmin || isAdmin || isModerator || isSupport;
  const hasBusinessAccess = isBusiness || isSuperAdmin || isAdmin;
  const canEdit = isSuperAdmin || isAdmin;
  const displayName = profileDisplayName || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";

  const value: AuthContextValue = {
    user, session, loading, rolesLoaded, displayName, isSuperAdmin, isAdmin, isModerator, isSupport, isBusiness, hasAdminAccess, hasBusinessAccess, canEdit, isEmailVerified,
    signIn, signUp, signOut,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
