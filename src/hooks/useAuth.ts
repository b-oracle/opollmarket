import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const lastSessionRef = useRef<Session | null>(null);

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

    // Get initial session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted.current) return;
      lastSessionRef.current = session;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkRoles(session.user.id, mounted);
      }
      if (mounted.current) setLoading(false);
    });

    // Then listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted.current) return;

        // If we had a session and now get null, it might be a transient
        // token-refresh failure (common in wallet/dApp browsers).
        // Try to recover before clearing auth state.
        if (!session && lastSessionRef.current && event === "SIGNED_OUT") {
          // Attempt to recover session from storage
          const { data: recovered } = await supabase.auth.getSession();
          if (recovered.session) {
            // Session is still valid in storage — ignore this transient event
            lastSessionRef.current = recovered.session;
            setSession(recovered.session);
            setUser(recovered.session.user);
            return;
          }
        }

        lastSessionRef.current = session;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await checkRoles(session.user.id, mounted);
        } else {
          setIsAdmin(false);
          setIsModerator(false);
        }
        if (mounted.current) setLoading(false);
      }
    );

    // Re-validate and refresh session when app returns to foreground
    // Wallet browsers often suspend JS execution; this catches stale states
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible" || !mounted.current) return;
      
      try {
        // Always try to refresh the session proactively when foregrounded
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (!mounted.current) return;

        if (freshSession) {
          // Proactively refresh token if it's going to expire within 5 minutes
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
          // Session truly gone — try one last refresh before giving up
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

    // Proactively refresh token every 2 minutes to prevent expiry
    const refreshInterval = setInterval(async () => {
      if (!mounted.current || !lastSessionRef.current) return;
      try {
        // Always refresh proactively — don't wait for near-expiry
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.session && mounted.current) {
          lastSessionRef.current = refreshed.session;
          setSession(refreshed.session);
          setUser(refreshed.session.user);
        }
      } catch {
        // Silently ignore — don't disrupt user
      }
    }, 2 * 60 * 1000); // Every 2 minutes

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(refreshInterval);
    };
  }, [checkRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
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
  };

  const signOut = async () => {
    lastSessionRef.current = null;
    await supabase.auth.signOut();
  };

  const isEmailVerified = !!user?.email_confirmed_at;
  const hasAdminAccess = isAdmin || isModerator;

  return { user, session, loading, isAdmin, isModerator, hasAdminAccess, isEmailVerified, signIn, signUp, signOut };
};
