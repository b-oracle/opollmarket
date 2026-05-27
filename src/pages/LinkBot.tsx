import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, MessageCircle } from "lucide-react";

type Status = "idle" | "claiming" | "success" | "error" | "needs_auth";

export default function LinkBot() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const kind = params.get("kind") || "telegram";
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (loading) return;
    if (!token) {
      setStatus("error");
      setMessage("Missing link token. Please request a new link from the bot.");
      return;
    }
    if (!user) {
      setStatus("needs_auth");
      return;
    }
    let cancelled = false;
    (async () => {
      setStatus("claiming");
      const { data, error } = await supabase.functions.invoke("claim-bot-link", {
        body: { token },
      });
      if (cancelled) return;
      if (error || (data && (data as { error?: string }).error)) {
        setStatus("error");
        setMessage(
          (data as { error?: string })?.error ||
            error?.message ||
            "Could not link your account.",
        );
        return;
      }
      setStatus("success");
    })();
    return () => { cancelled = true; };
  }, [loading, user, token]);

  const channelLabel = kind === "whatsapp" ? "WhatsApp" : "Telegram";

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Link {channelLabel}</h1>
            <p className="text-sm text-muted-foreground">Confirm this device to finish linking.</p>
          </div>
        </div>

        {status === "idle" || status === "claiming" || loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Linking your account…
          </div>
        ) : null}

        {status === "needs_auth" && (
          <div className="space-y-3">
            <p className="text-sm">Sign in to confirm and link your {channelLabel} chat.</p>
            <Button
              className="w-full"
              onClick={() =>
                navigate(`/auth?redirect=${encodeURIComponent(`/link-bot?token=${token}&kind=${kind}`)}`)
              }
            >
              Sign in to link
            </Button>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Linked successfully</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You can close this tab and return to {channelLabel}.
            </p>
            <Button asChild className="w-full" variant="secondary">
              <Link to="/">Back to app</Link>
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 mt-0.5" />
              <span className="text-sm">{message}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Links expire after 10 minutes and can only be used once. Type{" "}
              <span className="font-mono">/link</span> in {channelLabel} to get a fresh one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
