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
  const [isSupport, setIsSupport] = useState(false);
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
      const [{ data: superAdminData }, { data: adminData }, { data: modData }, { data: supportData }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" as any }),
        supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "moderator" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "support" as any }),
      ]);
      if (mounted.current) {
        setIsSuperAdmin(!!superAdminData);
        setIsAdmin(!!adminData);
        setIsModerator(!!modData);
        setIsSupport(!!supportData);
        setRolesLoaded(true);
      }
    } catch {
      if (mounted.current) {
        setIsSuperAdmin(false);
        setIsAdmin(false);
        setIsModerator(false);
        setIsSupport(false);
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
  const hasAdminAccess = isSuperAdmin || isAdmin || isModerator;
  const canEdit = isSuperAdmin || isAdmin; // Super admin + admin can make changes (admin has same access as moderator)
  const displayName = profileDisplayName || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";

  const value: AuthContextValue = {
    user, session, loading, rolesLoaded, displayName, isSuperAdmin, isAdmin, isModerator, hasAdminAccess, canEdit, isEmailVerified,
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
