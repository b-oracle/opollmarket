import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import React from "react";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string;
  isAdmin: boolean;
  isModerator: boolean;
  hasAdminAccess: boolean;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const lastSessionRef = useRef<Session | null>(null);

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
      const [{ data: adminData }, { data: modData }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "moderator" }),
      ]);
      if (mounted.current) {
        setIsAdmin(!!adminData);
        setIsModerator(!!modData);
      }
    } catch {
      if (mounted.current) {
        setIsAdmin(false);
        setIsModerator(false);
      }
    }
  }, []);

  useEffect(() => {
    const mounted = { current: true };

    // 1. Set up auth listener FIRST (Supabase recommended order)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted.current) return;

        // Transient sign-out recovery
        if (!newSession && lastSessionRef.current && event === "SIGNED_OUT") {
          const { data: recovered } = await supabase.auth.getSession();
          if (recovered.session) {
            lastSessionRef.current = recovered.session;
            setSession(recovered.session);
            setUser(recovered.session.user);
            return;
          }
        }

        lastSessionRef.current = newSession;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Use setTimeout to avoid potential Supabase deadlock during auth callback
          setTimeout(() => {
            if (mounted.current) checkRoles(newSession.user.id, mounted);
          }, 0);
        } else {
          setIsAdmin(false);
          setIsModerator(false);
        }
        if (mounted.current) setLoading(false);
      }
    );

    // 2. THEN get initial session
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted.current) return;
      lastSessionRef.current = initialSession;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        await checkRoles(initialSession.user.id, mounted);
      }
      if (mounted.current) setLoading(false);
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

    // Proactive refresh every 2 minutes
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
    }, 2 * 60 * 1000);

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
        emailRedirectTo: window.location.origin,
      },
    });
    if (!error) {
      localStorage.removeItem("referral_id");
    }
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    lastSessionRef.current = null;
    await supabase.auth.signOut();
  }, []);

  const isEmailVerified = !!user?.email_confirmed_at;
  const hasAdminAccess = isAdmin || isModerator;
  const displayName = profileDisplayName || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";

  const value: AuthContextValue = {
    user, session, loading, displayName, isAdmin, isModerator, hasAdminAccess, isEmailVerified,
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
