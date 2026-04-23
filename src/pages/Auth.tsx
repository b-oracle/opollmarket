import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn, UserPlus, Gift, CheckCircle2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCanonicalOrigin } from "@/lib/canonical";
import { lovable } from "@/integrations/lovable/index";
import SecurityVerificationModal from "@/components/SecurityVerificationModal";
import { createStatelessReadClient } from "@/lib/statelessSupabase";
import { isNativeAndroidGoogleSignIn, signInWithNativeGoogle } from "@/lib/nativeGoogleAuth";

const useIsDappBrowser = () =>
  useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as any;
    // Detect injected DApp browser wallets
    return !!(
      w.ethereum?.isRabby ||
      w.ethereum?.isTrust ||
      w.ethereum?.isBinance ||
      w.ethereum?.isSafePal ||
      w.ethereum?.isBitKeep ||
      w.ethereum?.isCoinbaseWallet ||
      (w.ethereum?.isMetaMask && w.ethereum?.isInApp)
    );
  }, []);

const withTimeout = async <T,>(promiseLike: PromiseLike<T>, timeoutMs: number): Promise<T | null> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promiseLike), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showResetPrompt, setShowResetPrompt] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralFromLink, setReferralFromLink] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [rememberedName, setRememberedName] = useState<string | null>(null);
  const [showLoginSecurity, setShowLoginSecurity] = useState(false);
  const [loginSecReqs, setLoginSecReqs] = useState<{ require_pin: boolean; require_totp: boolean }>({ require_pin: false, require_totp: false });
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDapp = useIsDappBrowser();
  const useNativeGoogle = isNativeAndroidGoogleSignIn();
  const handledInitialRedirect = useRef(false);

  // Redirect already-authenticated users away from auth page
  // This prevents logged-in users from seeing the registration form
  // when they arrive via deep links (e.g. shared space links with ?ref=)
  useEffect(() => {
    if (authLoading || handledInitialRedirect.current) return;
    handledInitialRedirect.current = true;
    if (!user) return;
    const redirectTo = searchParams.get("redirect");
    navigate(redirectTo || "/", { replace: true });
  }, [user, authLoading, navigate, searchParams]);

  const readLoginSecuritySettings = async (userId: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const secResult = await withTimeout(
        Promise.resolve(
          supabase
            .from("user_security_settings" as any)
            .select("pin_enabled, totp_enabled, require_pin_login, require_totp_login")
            .eq("user_id", userId)
            .maybeSingle()
        ),
        5000
      );

      if (secResult !== null) return secResult;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }

    return null;
  };

  useEffect(() => {
    const saved = localStorage.getItem("remembered_display_name");
    if (saved) setRememberedName(saved);
  }, []);

  const resetSent = searchParams.get("reset_sent") === "1";

  // Capture referral param
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setReferralCode(ref);
      setReferralFromLink(true);
      setMode("signup");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        let result = await signIn(email, password);
        // Retry once on network failure (common in preview iframe)
        if (result.error && result.error.message?.toLowerCase().includes("load failed")) {
          result = await signIn(email, password);
        }
        if (result.error) {
          // Detect OAuth-only accounts trying email/password login
          const msg = result.error.message?.toLowerCase() || "";
          if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
            toast.error("Incorrect email or password. Please try again.");
            setShowResetPrompt(true);
            setResetEmail(email);
          } else {
            toast.error(result.error.message);
          }
          return;
        }

        // Use cached session (no network call) to avoid auth-lock deadlocks
        const sessionResult = await withTimeout(Promise.resolve(supabase.auth.getSession()), 4000);
        const currentSession = sessionResult?.data?.session ?? null;
        const userId = currentSession?.user?.id;

        if (userId) {
          const statelessRead = createStatelessReadClient();

          const profileResult = await withTimeout(
            Promise.resolve(
              statelessRead
                .from("profiles")
                .select("display_name, is_blocked")
                .eq("id", userId)
                .single()
            ),
            5000
          );

          const profile = profileResult?.data;
          if (profile?.is_blocked) {
            await supabase.auth.signOut();
            toast.error("Your account has been banned. Please contact support.");
            return;
          }
          if (profile?.display_name) localStorage.setItem("remembered_display_name", profile.display_name);

          // Check if login security is required (must use authenticated client for RLS)
          const secResult = await readLoginSecuritySettings(userId);

          // Fail closed on repeated timeout/query failures to prevent PIN/TOTP bypass
          if (!secResult || secResult.error) {
            await supabase.auth.signOut({ scope: "local" });
            toast.error("Couldn't verify security settings. Please sign in again.");
            return;
          }

          const secData = secResult.data ?? null;
          const sec = secData as unknown as {
            pin_enabled: boolean;
            totp_enabled: boolean;
            require_pin_login: boolean;
            require_totp_login: boolean;
          } | null;

          const needPin = sec?.pin_enabled && sec?.require_pin_login;
          const needTotp = sec?.totp_enabled && sec?.require_totp_login;

          if (needPin || needTotp) {
            setLoginSecReqs({ require_pin: !!needPin, require_totp: !!needTotp });
            setShowLoginSecurity(true);
            return;
          }
        }

        toast.success("Logged in successfully!");
        const redirectTo = searchParams.get("redirect");
        navigate(redirectTo || "/");
        return;
      } else {
        // Validate referral code if provided
        if (referralCode.trim()) {
          // Resolve username to user ID for referred_by
          const { data: referrerId } = await supabase.rpc("get_user_id_by_username", {
            _username: referralCode.trim(),
          });
          if (!referrerId) {
            toast.error("Invalid referral code. Please check and try again.");
            return;
          }
          localStorage.setItem("referral_id", referrerId);
        }
        // Validate username
        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (cleanUsername.length < 3) {
          toast.error("Username must be at least 3 characters (letters, numbers, underscores).");
          return;
        }
        // Check uniqueness
        const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("username", cleanUsername);
        if ((count ?? 0) > 0) {
          setUsernameError("Username already taken");
          toast.error("Username already taken. Please choose another.");
          return;
        }
        const { error } = await signUp(email, password, displayName, cleanUsername);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Account created! Please check your email to verify your account.");
          setMode("login");
          return;
        }
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      toast.error(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">
            {mode === "login"
              ? rememberedName
                ? `Welcome back, ${rememberedName}`
                : "Welcome Back"
              : "Create Account"}
          </h1>
          <p className="text-sm text-muted-foreground">{mode === "login" ? "Sign in to access your account" : "Sign up to get started"}</p>
          {referralFromLink && mode === "signup" && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">Referral code applied!</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name"
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      setUsername(v);
                      setUsernameError("");
                    }}
                    onBlur={async () => {
                      if (username.length >= 3) {
                        const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("username", username);
                        if ((count ?? 0) > 0) setUsernameError("Username already taken");
                      }
                    }}
                    placeholder="your_username"
                    required
                    minLength={3}
                    maxLength={25}
                    className="w-full bg-muted/50 border border-border rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {usernameError && <p className="text-xs text-destructive mt-1">{usernameError}</p>}
                {username.length > 0 && username.length < 3 && <p className="text-xs text-muted-foreground mt-1">Min 3 characters</p>}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  <span className="flex items-center gap-1"><Gift className="w-3 h-3" /> Referral Code <span className="text-muted-foreground/60">(optional)</span></span>
                </label>
                <input type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="Enter referral code"
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
              className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50">
            {mode === "login" ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        {showResetPrompt && mode === "login" && (
          <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-3">
            <p className="text-xs text-foreground font-medium mb-2">
              Wrong password? Would you like to reset it?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={sendingReset}
                onClick={async () => {
                  if (!resetEmail.trim() || sendingReset) return;

                  setSendingReset(true);
                  try {
                    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
                      redirectTo: `${getCanonicalOrigin()}/reset-password`,
                    });

                    if (!error) {
                      toast.success("Password reset link sent. Use the newest email.");
                      setShowResetPrompt(false);
                    } else {
                      toast.error(error.message || "Failed to send reset email. Try again.");
                    }
                  } finally {
                    setSendingReset(false);
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingReset ? "Sending..." : "Yes, reset password"}
              </button>
              <button
                type="button"
                onClick={() => setShowResetPrompt(false)}
                className="flex-1 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-colors"
              >
                No, try again
              </button>
            </div>
          </div>
        )}

        {!isDapp && mode === "login" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted/60 border border-border px-3 py-2.5">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Signed up with Google? Use the <span className="font-semibold text-foreground">Google button below</span> to sign in — email & password won't work unless you've set one via "Forgot password."
            </p>
          </div>
        )}

        {!isDapp && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Social Login */}
            <div className="space-y-2 mb-4">
              <button
                onClick={async () => {
                  try {
                    if (useNativeGoogle) {
                      await signInWithNativeGoogle();
                      toast.success("Logged in successfully!");
                      const redirectTo = searchParams.get("redirect");
                      navigate(redirectTo || "/");
                      return;
                    }

                    const { error } = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: window.location.origin,
                    });
                    if (error) toast.error("Google sign-in failed");
                  } catch (err: any) {
                    const message = String(err?.message || "Google sign-in failed");
                    if (!message.toLowerCase().includes("cancel")) toast.error(message);
                  }
                }}
                className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                </div>
                <span className="text-sm font-medium">Continue with Google</span>
              </button>
            </div>
          </>
        )}

        {resetSent && mode === "login" && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-3">
            <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground mb-0.5">Password reset email sent!</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Check your inbox for a reset link. After setting your new password, sign in below.
              </p>
            </div>
          </div>
        )}

        {mode === "login" && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot your password?
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-primary font-semibold hover:underline">
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>

        <button onClick={() => navigate("/")} className="w-full text-center text-xs text-muted-foreground mt-4 hover:text-foreground">
          ← Back to Home
        </button>
      </div>
      <SecurityVerificationModal
        open={showLoginSecurity}
        onClose={() => {
          setShowLoginSecurity(false);
          // Sign out if user cancels verification
          supabase.auth.signOut({ scope: "local" });
          toast.error("Login cancelled — verification required");
        }}
        onVerified={() => {
          setShowLoginSecurity(false);
          // Use user from useAuth() synchronously — avoids async race condition
          if (user?.id) {
            try { localStorage.setItem(`login_sec_verified_${user.id}`, Date.now().toString()); } catch {}
          }
          toast.success("Logged in successfully!");
          const redirectTo = searchParams.get("redirect");
          navigate(redirectTo || "/");
        }}
        requirePin={loginSecReqs.require_pin}
        requireTotp={loginSecReqs.require_totp}
      />
    </div>
  );
};

export default Auth;
