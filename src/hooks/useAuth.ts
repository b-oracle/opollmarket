import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkAdmin = async (userId: string) => {
      try {
        const { data } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (mounted) setIsAdmin(!!data);
      } catch {
        if (mounted) setIsAdmin(false);
      }
    };

    // Get initial session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkAdmin(session.user.id);
      }
      if (mounted) setLoading(false);
    });

    // Then listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await checkAdmin(session.user.id);
        } else {
          setIsAdmin(false);
        }
        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    // Check for referral ID in localStorage
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
      // Clean up referral storage
      localStorage.removeItem("referral_id");
    }
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isEmailVerified = !!user?.email_confirmed_at;

  return { user, session, loading, isAdmin, isEmailVerified, signIn, signUp, signOut };
};
