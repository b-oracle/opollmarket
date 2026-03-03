import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Eye, EyeOff, LogIn, UserPlus, Wallet } from "lucide-react";
import { useConnect } from "wagmi";
import { bsc } from "wagmi/chains";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { connect, connectors, isPending } = useConnect();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) { toast.error(error.message); }
      else { toast.success("Logged in successfully!"); navigate("/"); }
    } else {
      const { error } = await signUp(email, password, displayName);
      if (error) { toast.error(error.message); }
      else { toast.success("Account created! Logging you in..."); navigate("/"); }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">{mode === "login" ? "Welcome Back" : "Create Account"}</h1>
          <p className="text-sm text-muted-foreground">{mode === "login" ? "Sign in to access your account" : "Sign up to get started"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name"
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
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

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or continue with</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Wallet Connect */}
        <div className="space-y-2">
          {connectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => connect({ connector: c, chainId: bsc.id })}
              disabled={isPending}
              className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors active:scale-[0.98] disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                {c.name.includes("MetaMask") ? "🦊" : c.name.includes("WalletConnect") ? "🔗" : <Wallet className="w-4 h-4" />}
              </div>
              <span className="text-sm font-medium">{c.name}</span>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-primary font-semibold hover:underline">
            {mode === "login" ? "Sign Up" : "Sign In"}
          </button>
        </p>

        <button onClick={() => navigate("/")} className="w-full text-center text-xs text-muted-foreground mt-4 hover:text-foreground">
          ← Back to Home
        </button>
      </div>
    </div>
  );
};

export default Auth;
