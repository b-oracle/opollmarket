import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, MailX, CheckCircle2, AlertCircle } from "lucide-react";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Status = "loading" | "valid" | "already" | "invalid" | "submitting" | "success" | "error";

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStatus("invalid");
      setMessage("Missing unsubscribe token.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}?token=${encodeURIComponent(token)}`, {
          headers: { apikey: ANON_KEY },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.valid) setStatus("valid");
        else if (data?.reason === "already_unsubscribed") setStatus("already");
        else {
          setStatus("invalid");
          setMessage(data?.error || "This unsubscribe link is invalid or expired.");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not validate the link. Please try again later.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const confirm = async () => {
    setStatus("submitting");
    try {
      const res = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) setStatus("success");
      else if (data?.reason === "already_unsubscribed") setStatus("already");
      else {
        setStatus("error");
        setMessage(data?.error || "Failed to unsubscribe.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6 py-12 bg-background">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Checking link…</h1>
          </>
        )}
        {status === "valid" && (
          <>
            <MailX className="w-10 h-10 mx-auto text-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Unsubscribe from emails?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You'll stop receiving notification emails from opollmarket. You can re-enable them anytime in Settings.
            </p>
            <Button onClick={confirm} className="mt-6 w-full">
              Confirm Unsubscribe
            </Button>
          </>
        )}
        {status === "submitting" && (
          <>
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold">Unsubscribing…</h1>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <h1 className="mt-4 text-xl font-semibold">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We won't send notification emails to this address anymore.
            </p>
          </>
        )}
        {status === "already" && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <h1 className="mt-4 text-xl font-semibold">Already unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">This email address is already unsubscribed.</p>
          </>
        )}
        {(status === "invalid" || status === "error") && (
          <>
            <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </>
        )}
      </div>
    </main>
  );
};

export default Unsubscribe;
