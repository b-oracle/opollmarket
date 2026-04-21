import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface FcmToken {
  id: string;
  token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

export default function PushDebug() {
  const { user, loading: authLoading } = useAuth();
  const [tokens, setTokens] = useState<FcmToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [platform, setPlatform] = useState<string>("web");
  const [permission, setPermission] = useState<string>("unknown");
  const [lastError, setLastError] = useState<string | null>(null);

  // Detect platform
  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        setIsNative(Capacitor.isNativePlatform());
        setPlatform(Capacitor.getPlatform());
        if (Capacitor.isNativePlatform()) {
          const { PushNotifications } = await import("@capacitor/push-notifications");
          const perm = await PushNotifications.checkPermissions();
          setPermission(perm.receive);
        } else {
          setPermission(
            typeof Notification !== "undefined" ? Notification.permission : "unsupported"
          );
        }
      } catch {
        setPlatform("web");
      }
    })();
  }, []);

  const loadTokens = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("user_fcm_tokens" as any)
      .select("id, token, platform, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      setLastError(error.message);
      setTokens([]);
    } else {
      setTokens((data || []) as unknown as FcmToken[]);
      setLastError(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) loadTokens();
  }, [user, loadTokens]);

  const handleRegister = async () => {
    if (!user) return;
    setRegistering(true);
    setLastError(null);
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        toast.error("Native registration only works in the installed app");
        setRegistering(false);
        return;
      }
      const { PushNotifications } = await import("@capacitor/push-notifications");

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        perm = await PushNotifications.requestPermissions();
        setPermission(perm.receive);
      }
      if (perm.receive !== "granted") {
        toast.error("Notification permission denied");
        setRegistering(false);
        return;
      }

      // One-shot listener for this registration attempt
      const sub = await PushNotifications.addListener("registration", async (tok) => {
        try {
          const { error } = await supabase.from("user_fcm_tokens" as any).upsert(
            {
              user_id: user.id,
              token: tok.value,
              platform: Capacitor.getPlatform(),
            },
            { onConflict: "user_id,token" }
          );
          if (error) {
            setLastError(error.message);
            toast.error("Saved locally but DB upsert failed: " + error.message);
          } else {
            toast.success("Token registered ✓");
            await loadTokens();
          }
        } finally {
          sub.remove();
          setRegistering(false);
        }
      });

      const errSub = await PushNotifications.addListener("registrationError", (err) => {
        setLastError(JSON.stringify(err));
        toast.error("Registration error: " + JSON.stringify(err));
        errSub.remove();
        setRegistering(false);
      });

      await PushNotifications.register();
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setLastError(msg);
      toast.error("Failed: " + msg);
      setRegistering(false);
    }
  };

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copied");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground">Sign in to view push diagnostics</p>
        <Button asChild>
          <Link to="/auth">Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Push Token Verification</h1>
          <p className="text-sm text-muted-foreground">
            Diagnostic view for native push registration
          </p>
        </div>

        {/* Identity */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Identity</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">User ID</span>
              <button
                onClick={() => copy(user.id)}
                className="font-mono text-xs flex items-center gap-1 hover:text-primary"
              >
                {user.id}
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-mono text-xs">{user.email}</span>
            </div>
          </div>
        </Card>

        {/* Environment */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Environment</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Platform</span>
              <Badge variant={isNative ? "default" : "secondary"}>{platform}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Native runtime</span>
              {isNative ? (
                <Badge>Yes</Badge>
              ) : (
                <Badge variant="secondary">No (web)</Badge>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Notification permission</span>
              <Badge variant={permission === "granted" ? "default" : "destructive"}>
                {permission}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Tokens */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              Registered Tokens
              {tokens.length > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-primary" />
              ) : (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadTokens}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                No tokens registered for this user.
              </p>
              {!isNative && (
                <p className="text-xs text-muted-foreground">
                  Tokens are only registered when you open the installed Android/iOS
                  app while signed in.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="border border-border rounded-lg p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{t.platform}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(t.updated_at).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => copy(t.token)}
                    className="font-mono break-all text-left w-full hover:text-primary flex items-start gap-1"
                  >
                    <span className="flex-1">{t.token}</span>
                    <Copy className="w-3 h-3 mt-0.5 shrink-0" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Re-register */}
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Actions</h2>
          <Button
            onClick={handleRegister}
            disabled={registering || !isNative}
            className="w-full"
          >
            {registering ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Registering…
              </>
            ) : (
              "Re-register device with FCM"
            )}
          </Button>
          {!isNative && (
            <p className="text-xs text-muted-foreground">
              Only available inside the installed Android/iOS app.
            </p>
          )}
          {lastError && (
            <div className="text-xs text-destructive font-mono break-all p-2 bg-destructive/10 rounded">
              {lastError}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
