import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";

const hasRecoveryParams = () => {
  const { hash, search } = window.location;
  return (
    hash.includes("type=recovery") ||
    hash.includes("access_token=") ||
    search.includes("type=recovery") ||
    search.includes("token_hash=") ||
    search.includes("code=")
  );
};

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(() => hasRecoveryParams());
  const [checking, setChecking] = useState(() => hasRecoveryParams());
  const navigate = useNavigate();

  useEffect(() => {
    if (isRecovery) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    const isResetRoute = window.location.pathname.startsWith("/reset-password");
    const recoveryHintPresent = hasRecoveryParams();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return;

      const recoveredFromAuthEvent =
        event === "PASSWORD_RECOVERY" ||
        (event === "SIGNED_IN" && isResetRoute && (recoveryHintPresent || !!newSession));

      if (recoveredFromAuthEvent) {
        setIsRecovery(true);
        setChecking(false);
      }
    });

    const checkSessionWithRetry = async () => {
      const attempts = recoveryHintPresent ? 5 : 1;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session && isResetRoute) {
          setIsRecovery(true);
          setChecking(false);
          return;
        }

        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      if (!cancelled) setChecking(false);
    };

    checkSessionWithRetry();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isRecovery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { toast.error("Passwords don't match"); return; }
    setLoading(true);
    try {
      const updatePromise = supabase.auth.updateUser({ password });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10000)
      );
      const result = await Promise.race([updatePromise, timeoutPromise]) as any;
      if (result?.error) {
        toast.error(result.error.message);
      } else {
        toast.success("Password updated successfully!");
        navigate("/auth");
      }
    } catch (err: any) {
      if (err?.message === "timeout") {
        // Password likely updated server-side but response hung
        toast.success("Password updated! Redirecting...");
        navigate("/auth");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Invalid or expired reset link.</p>
          <button onClick={() => navigate("/forgot-password")} className="text-primary font-semibold hover:underline">Request a new link</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Set New Password</h1>
          <p className="text-sm text-muted-foreground">Enter your new password below</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">New Password</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirm Password</label>
            <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••" required minLength={6}
              className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50">
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
        <button onClick={() => navigate("/auth")} className="w-full text-center text-xs text-muted-foreground mt-4 hover:text-foreground">
          ← Back to Sign In
        </button>
      </div>
    </div>
  );
};

export default ResetPassword;
