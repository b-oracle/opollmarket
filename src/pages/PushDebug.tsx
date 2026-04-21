import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Copy, PhoneCall, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface SelfTestResult {
  ok: boolean;
  tokens_on_file: number;
  conversation_id: string | null;
  call_id: string | null;
  deep_link: string;
  sent: number;
  expired: number;
  results?: Array<{ token?: string; ok?: boolean; status?: number; error_code?: string; hint?: string }>;
  hint?: string | null;
  error?: string;
}

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
  const [testingCall, setTestingCall] = useState(false);
  const [testResult, setTestResult] = useState<SelfTestResult | null>(null);
  const [platformFilter, setPlatformFilter] = useState<"all" | "android" | "ios">("all");

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

  const handleTestCall = async () => {
    if (!user) return;
    setTestingCall(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("self-test-call-push");
      if (error) throw error;
      const result = data as SelfTestResult;
      setTestResult(result);
      if (result.ok) {
        toast.success(
          result.conversation_id
            ? "Test call sent — your device should ring shortly"
            : "Push sent (no conversation found for deep-link test)"
        );
      } else if (result.tokens_on_file === 0) {
        toast.error("No FCM tokens registered for this device");
      } else {
        toast.error(result.hint || "Push delivery failed — see results below");
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setTestResult({
        ok: false,
        tokens_on_file: 0,
        conversation_id: null,
        call_id: null,
        deep_link: "",
        sent: 0,
        expired: 0,
        error: msg,
      });
      toast.error("Test call failed: " + msg);
    } finally {
      setTestingCall(false);
    }
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

          {tokens.length > 0 && (() => {
            const counts = tokens.reduce(
              (acc, t) => {
                const p = (t.platform || "").toLowerCase();
                if (p === "android") acc.android++;
                else if (p === "ios") acc.ios++;
                else acc.other++;
                return acc;
              },
              { android: 0, ios: 0, other: 0 }
            );
            const filters: Array<{ key: "all" | "android" | "ios"; label: string; count: number }> = [
              { key: "all", label: "All", count: tokens.length },
              { key: "android", label: "Android", count: counts.android },
              { key: "ios", label: "iOS", count: counts.ios },
            ];
            return (
              <div className="flex flex-wrap gap-2">
                {filters.map((f) => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={platformFilter === f.key ? "default" : "outline"}
                    onClick={() => setPlatformFilter(f.key)}
                    className="h-7 text-xs"
                    disabled={f.key !== "all" && f.count === 0}
                  >
                    {f.label}
                    <span className="ml-1.5 opacity-70">({f.count})</span>
                  </Button>
                ))}
              </div>
            );
          })()}

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
          ) : (() => {
            const filtered = tokens.filter((t) => {
              if (platformFilter === "all") return true;
              return (t.platform || "").toLowerCase() === platformFilter;
            });
            // Newest token across the *full* set (not just the filtered view)
            // so the "Newest" highlight is stable when toggling filters.
            const newestId = tokens.reduce<string | null>((newest, t) => {
              if (!newest) return t.id;
              const tTime = new Date(t.updated_at).getTime();
              const nTime = new Date(
                tokens.find((x) => x.id === newest)!.updated_at
              ).getTime();
              return tTime > nTime ? t.id : newest;
            }, null);

            if (filtered.length === 0) {
              return (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No {platformFilter} tokens registered.
                </p>
              );
            }

            return (
              <div className="space-y-3">
                {filtered.map((t) => {
                  const isNewest = t.id === newestId;
                  return (
                    <div
                      key={t.id}
                      className={`rounded-lg p-3 space-y-2 text-xs border ${
                        isNewest
                          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{t.platform}</Badge>
                          {isNewest && (
                            <Badge className="text-[10px] py-0 px-1.5">Newest</Badge>
                          )}
                        </div>
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
                  );
                })}
              </div>
            );
          })()}
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

          <div className="pt-2 border-t border-border space-y-2">
            <div>
              <h3 className="text-sm font-semibold">One-tap call test</h3>
              <p className="text-xs text-muted-foreground">
                Sends a sample incoming-call push to your own device and inserts a
                real call record on your most recent DM so tapping the
                notification opens that conversation.
              </p>
            </div>
            <Button
              onClick={handleTestCall}
              disabled={testingCall}
              variant="secondary"
              className="w-full"
            >
              {testingCall ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending test call…
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4 mr-2" />
                  Ring my device (test)
                </>
              )}
            </Button>

            {testResult && (
              <div className="space-y-2 text-xs rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {testResult.ok ? (
                    <Badge>Sent</Badge>
                  ) : (
                    <Badge variant="destructive">Failed</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tokens on file</span>
                  <Badge variant={testResult.tokens_on_file > 0 ? "default" : "destructive"}>
                    {testResult.tokens_on_file}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Delivered / Expired</span>
                  <span className="font-mono">
                    {testResult.sent} / {testResult.expired}
                  </span>
                </div>
                {testResult.conversation_id && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Conversation</span>
                    <Link
                      to={`/messages/${testResult.conversation_id}`}
                      className="font-mono text-primary hover:underline truncate flex items-center gap-1"
                    >
                      <span className="truncate">{testResult.conversation_id}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </Link>
                  </div>
                )}
                {testResult.call_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Call ID</span>
                    <span className="font-mono text-xs truncate ml-2">{testResult.call_id}</span>
                  </div>
                )}
                {testResult.deep_link && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Deep-link</span>
                    <button
                      onClick={() => copy(testResult.deep_link)}
                      className="font-mono truncate hover:text-primary flex items-center gap-1"
                    >
                      <span className="truncate">{testResult.deep_link}</span>
                      <Copy className="w-3 h-3 shrink-0" />
                    </button>
                  </div>
                )}
                {testResult.hint && (
                  <p className="text-xs text-muted-foreground italic pt-1 border-t border-border">
                    {testResult.hint}
                  </p>
                )}
                {testResult.error && (
                  <p className="text-xs text-destructive font-mono break-all">
                    {testResult.error}
                  </p>
                )}
                {testResult.results && testResult.results.length > 0 && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-muted-foreground">
                      Per-token results ({testResult.results.length})
                    </summary>
                    <pre className="mt-2 overflow-auto text-[10px] bg-background p-2 rounded">
                      {JSON.stringify(testResult.results, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
