import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import React from "react";
import { getCanonicalOrigin } from "@/lib/canonical";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  hasAdminAccess: boolean;
  canEdit: boolean;
  isEmailVerified: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: any }>;
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
      const [{ data: superAdminData }, { data: adminData }, { data: modData }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" as any }),
        supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "moderator" }),
      ]);
      if (mounted.current) {
        setIsSuperAdmin(!!superAdminData);
        setIsAdmin(!!adminData);
        setIsModerator(!!modData);
      }
    } catch {
      if (mounted.current) {
        setIsSuperAdmin(false);
        setIsAdmin(false);
        setIsModerator(false);
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
          setProfileDisplayName(null);
          if (mounted.current) setLoading(false);
          return;
        }

        // Reset swipe hints on sign-in (but NOT the social tutorial — it should only replay manually)
        if (event === "SIGNED_IN" && newSession?.user) {
          // Check if user is banned
          const { data: blockCheck } = await supabase
            .from("profiles")
            .select("is_blocked")
            .eq("id", newSession.user.id)
            .maybeSingle();
          if (blockCheck?.is_blocked) {
            await supabase.auth.signOut();
            return;
          }
          localStorage.removeItem("social_swipe_used");
          localStorage.removeItem("feed_swipe_hint_seen");
          // Recheck verification level in background (catches stale badges)
          supabase.functions.invoke("update-verification").catch(() => {});
        }

        lastSessionRef.current = newSession;
        setSession(newSession);
        setUser(newSession?.user ?? null);

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
      .catch(async () => {
        if (!mounted.current) return;
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // ignore
        }
        lastSessionRef.current = null;
        setSession(null);
        setUser(null);
        setIsSuperAdmin(false);
        setIsAdmin(false);
        setIsModerator(false);
        setProfileDisplayName(null);
        setLoading(false);
      });

    // Re-validate session on foreground
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible" || !mounted.current) return;

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
              return;
            }
          }
          lastSessionRef.current = freshSession;
          setSession(freshSession);
          setUser(freshSession.user);
          await checkRoles(freshSession.user.id, mounted);
        } else if (lastSessionRef.current) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session && mounted.current) {
            lastSessionRef.current = refreshed.session;
            setSession(refreshed.session);
            setUser(refreshed.session.user);
            await checkRoles(refreshed.session.user.id, mounted);
          } else if (mounted.current) {
            lastSessionRef.current = null;
            setSession(null);
            setUser(null);
            setIsAdmin(false);
            setIsModerator(false);
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) localStorage.removeItem("social_swipe_used");
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const referredBy = localStorage.getItem("referral_id");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          ...(referredBy ? { referred_by: referredBy } : {}),
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
    // Immediately clear all state so UI updates instantly
    signingOutRef.current = true;
    lastSessionRef.current = null;
    setSession(null);
    setUser(null);
    setIsSuperAdmin(false);
    setIsAdmin(false);
    setIsModerator(false);
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
  const hasAdminAccess = isSuperAdmin || isAdmin || isModerator;
  const canEdit = isSuperAdmin || isAdmin; // Super admin + admin can make changes (admin has same access as moderator)
  const displayName = profileDisplayName || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";

  const value: AuthContextValue = {
    user, session, loading, displayName, isSuperAdmin, isAdmin, isModerator, hasAdminAccess, canEdit, isEmailVerified,
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
