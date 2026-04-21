import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Copy, PhoneCall, ExternalLink, Send, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";

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

interface RlsDiagnostic {
  operation: "select" | "upsert";
  code?: string;
  message: string;
  details?: string;
  hint?: string;
  isRls: boolean;
  steps: string[];
}

const RLS_CODES = new Set([
  "42501", // insufficient_privilege
  "PGRST301", // JWT expired / no auth
  "PGRST116", // no rows / RLS-blocked
]);

function diagnoseRlsError(
  operation: "select" | "upsert",
  err: { code?: string; message?: string; details?: string; hint?: string } | null
): RlsDiagnostic | null {
  if (!err) return null;
  const msg = err.message || "Unknown error";
  const code = err.code;
  const lowered = (msg + " " + (err.details || "") + " " + (err.hint || "")).toLowerCase();
  const isRls =
    (!!code && RLS_CODES.has(code)) ||
    lowered.includes("row-level security") ||
    lowered.includes("row level security") ||
    lowered.includes("violates row-level") ||
    lowered.includes("permission denied") ||
    lowered.includes("not authorized") ||
    lowered.includes("rls");

  const steps: string[] = [];
  if (isRls) {
    if (operation === "upsert") {
      steps.push(
        "Confirm you are signed in — RLS requires a valid auth.uid().",
        "The user_fcm_tokens table needs an INSERT/UPDATE policy: USING/WITH CHECK (auth.uid() = user_id).",
        "Verify the row's user_id column matches your authenticated user id (shown above).",
        "If a unique constraint exists on (user_id, token), an UPDATE policy is also required for upsert to succeed.",
        "Check that RLS is ENABLED on user_fcm_tokens (ALTER TABLE … ENABLE ROW LEVEL SECURITY)."
      );
    } else {
      steps.push(
        "Confirm you are signed in — RLS requires a valid auth.uid().",
        "Add a SELECT policy on user_fcm_tokens: USING (auth.uid() = user_id).",
        "Verify RLS is enabled on user_fcm_tokens.",
        "If using a service-role read elsewhere, ensure the client read uses the user JWT (not anon)."
      );
    }
  } else {
    steps.push(
      "Check the Network tab for the failing request and inspect the response.",
      "Verify the table name and column names match your schema (user_fcm_tokens, user_id, token, platform).",
      "Try signing out and back in to refresh the auth session."
    );
  }

  return {
    operation,
    code,
    message: msg,
    details: err.details,
    hint: err.hint,
    isRls,
    steps,
  };
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
  const [rlsDiag, setRlsDiag] = useState<RlsDiagnostic | null>(null);

  // Market deep-link push
  const [marketQuery, setMarketQuery] = useState("");
  const [marketResults, setMarketResults] = useState<Array<{ id: string; title: string; image_url: string | null }>>([]);
  const [searchingMarkets, setSearchingMarkets] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<{ id: string; title: string } | null>(null);
  const [sendingMarketPush, setSendingMarketPush] = useState(false);
  const [marketPushResult, setMarketPushResult] = useState<{
    ok: boolean;
    deep_link: string;
    sent?: number;
    expired?: number;
    error?: string;
    hint?: string | null;
    results?: Array<{ token?: string; ok?: boolean; status?: number; error_code?: string; hint?: string }>;
  } | null>(null);

  // Device token verification
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    deviceToken: string | null;
    matchedRow: FcmToken | null;
    isNewest: boolean;
    newestRow: FcmToken | null;
    error?: string;
    note?: string;
  } | null>(null);

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
      setRlsDiag(diagnoseRlsError("select", error as any));
      setTokens([]);
    } else {
      setTokens((data || []) as unknown as FcmToken[]);
      setLastError(null);
      setRlsDiag(null);
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
            setRlsDiag(diagnoseRlsError("upsert", error as any));
            toast.error("Saved locally but DB upsert failed: " + error.message);
          } else {
            toast.success("Token registered ✓");
            setRlsDiag(null);
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

  // Search markets by title (active first)
  const searchMarkets = useCallback(async (q: string) => {
    if (!q.trim()) {
      setMarketResults([]);
      return;
    }
    setSearchingMarkets(true);
    const { data, error } = await supabase
      .from("markets")
      .select("id, title, image_url, status")
      .ilike("title", `%${q.trim()}%`)
      .in("status", ["active", "ended", "resolved"])
      .order("status", { ascending: true })
      .limit(8);
    if (error) {
      toast.error("Market search failed: " + error.message);
      setMarketResults([]);
    } else {
      setMarketResults(
        (data || []).map((m: any) => ({ id: m.id, title: m.title, image_url: m.image_url }))
      );
    }
    setSearchingMarkets(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchMarkets(marketQuery), 250);
    return () => clearTimeout(t);
  }, [marketQuery, searchMarkets]);

  const handleSendMarketPush = async () => {
    if (!user || !selectedMarket) return;
    setSendingMarketPush(true);
    setMarketPushResult(null);
    const deepLink = `/market/${selectedMarket.id}`;
    try {
      const { data, error } = await supabase.functions.invoke("send-fcm-push", {
        body: {
          user_id: user.id,
          title: "Market update 📈",
          body: selectedMarket.title,
          url: deepLink,
          data: {
            type: "market_deeplink",
            market_id: selectedMarket.id,
            url: deepLink,
          },
        },
      });
      if (error) throw error;
      const result = data as any;
      setMarketPushResult({
        ok: !!result?.ok,
        deep_link: deepLink,
        sent: result?.sent,
        expired: result?.expired,
        hint: result?.hint,
        results: result?.results,
        error: result?.error,
      });
      if (result?.ok) {
        toast.success("Market push sent — tap the notification on your device");
      } else {
        toast.error(result?.error || result?.hint || "Push failed — see results below");
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setMarketPushResult({ ok: false, deep_link: deepLink, error: msg });
      toast.error("Send failed: " + msg);
    } finally {
      setSendingMarketPush(false);
    }
  };

  const handleVerifyDevice = async () => {
    if (!user) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        setVerifyResult({
          deviceToken: null,
          matchedRow: null,
          isNewest: false,
          newestRow: null,
          error: "Verification requires the installed Android/iOS app — web browsers don't have an FCM device token.",
        });
        setVerifying(false);
        return;
      }

      const { PushNotifications } = await import("@capacitor/push-notifications");
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        perm = await PushNotifications.requestPermissions();
        setPermission(perm.receive);
      }
      if (perm.receive !== "granted") {
        setVerifyResult({
          deviceToken: null,
          matchedRow: null,
          isNewest: false,
          newestRow: null,
          error: "Notification permission denied — cannot read this device's FCM token.",
        });
        setVerifying(false);
        return;
      }

      // Capture this device's current FCM token via a one-shot registration
      const deviceToken: string | null = await new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          regSub.then((s) => s.remove());
          errSub.then((s) => s.remove());
          resolve(null);
        }, 8000);

        const regSub = PushNotifications.addListener("registration", (tok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          regSub.then((s) => s.remove());
          errSub.then((s) => s.remove());
          resolve(tok.value);
        });
        const errSub = PushNotifications.addListener("registrationError", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          regSub.then((s) => s.remove());
          errSub.then((s) => s.remove());
          resolve(null);
        });
        PushNotifications.register().catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          regSub.then((s) => s.remove());
          errSub.then((s) => s.remove());
          resolve(null);
        });
      });

      if (!deviceToken) {
        setVerifyResult({
          deviceToken: null,
          matchedRow: null,
          isNewest: false,
          newestRow: null,
          error: "Could not retrieve an FCM token from this device. Try Re-register and check Google Play Services.",
        });
        setVerifying(false);
        return;
      }

      // Pull the latest snapshot from the DB and compare
      const { data, error } = await supabase
        .from("user_fcm_tokens" as any)
        .select("id, token, platform, created_at, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        setVerifyResult({
          deviceToken,
          matchedRow: null,
          isNewest: false,
          newestRow: null,
          error: "DB read failed: " + error.message,
        });
        setRlsDiag(diagnoseRlsError("select", error as any));
        setVerifying(false);
        return;
      }

      const rows = (data || []) as unknown as FcmToken[];
      setTokens(rows);
      const matched = rows.find((r) => r.token === deviceToken) || null;
      const newest = rows[0] || null;
      const isNewest = !!matched && !!newest && matched.id === newest.id;

      setVerifyResult({
        deviceToken,
        matchedRow: matched,
        isNewest,
        newestRow: newest,
        note:
          matched && !isNewest
            ? "Token exists but a newer registration is on file — likely from another device. Re-register to make this device the latest."
            : undefined,
      });

      if (matched && isNewest) {
        toast.success("Verified — this device is the latest registration ✓");
      } else if (matched) {
        toast.warning("Token found, but it's not the newest registration");
      } else {
        toast.error("This device's token is NOT in user_fcm_tokens");
      }
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setVerifyResult({
        deviceToken: null,
        matchedRow: null,
        isNewest: false,
        newestRow: null,
        error: msg,
      });
      toast.error("Verification failed: " + msg);
    } finally {
      setVerifying(false);
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

        {/* Verify this device */}
        <Card className="p-4 space-y-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Verify This Device
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Reads this device's current FCM token and confirms it exists in
              <span className="font-mono"> user_fcm_tokens</span> and matches your
              latest registration timestamp.
            </p>
          </div>
          <Button
            onClick={handleVerifyDevice}
            disabled={verifying || !isNative}
            variant="secondary"
            className="w-full"
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Check my token in database
              </>
            )}
          </Button>
          {!isNative && (
            <p className="text-xs text-muted-foreground">
              Only works inside the installed Android/iOS app.
            </p>
          )}

          {verifyResult && (
            <div
              className={`rounded-lg border p-3 space-y-2 text-xs ${
                verifyResult.error
                  ? "border-destructive/40 bg-destructive/5"
                  : verifyResult.matchedRow && verifyResult.isNewest
                  ? "border-primary/40 bg-primary/5"
                  : verifyResult.matchedRow
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold">Result</span>
                {verifyResult.error ? (
                  <Badge variant="destructive">Error</Badge>
                ) : verifyResult.matchedRow && verifyResult.isNewest ? (
                  <Badge>Verified — Latest</Badge>
                ) : verifyResult.matchedRow ? (
                  <Badge variant="secondary">Found — Not Latest</Badge>
                ) : (
                  <Badge variant="destructive">Not in Database</Badge>
                )}
              </div>

              {verifyResult.error && (
                <p className="font-mono text-destructive break-all">
                  {verifyResult.error}
                </p>
              )}

              {verifyResult.deviceToken && (
                <div className="space-y-1">
                  <p className="text-muted-foreground font-semibold">
                    This device's FCM token
                  </p>
                  <button
                    onClick={() => copy(verifyResult.deviceToken!)}
                    className="font-mono break-all text-left w-full hover:text-primary flex items-start gap-1"
                  >
                    <span className="flex-1">{verifyResult.deviceToken}</span>
                    <Copy className="w-3 h-3 mt-0.5 shrink-0" />
                  </button>
                </div>
              )}

              {verifyResult.matchedRow && (
                <div className="space-y-1 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">DB row id</span>
                    <span className="font-mono">{verifyResult.matchedRow.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Platform</span>
                    <Badge variant="outline">{verifyResult.matchedRow.platform}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Updated at</span>
                    <span className="font-mono">
                      {new Date(verifyResult.matchedRow.updated_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {verifyResult.newestRow && (
                <div className="space-y-1 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Latest registration on file</span>
                    <span className="font-mono">
                      {new Date(verifyResult.newestRow.updated_at).toLocaleString()}
                    </span>
                  </div>
                  {verifyResult.matchedRow && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Matches latest?</span>
                      {verifyResult.isNewest ? (
                        <Badge className="gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <XCircle className="w-3 h-3" /> No
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              )}

              {verifyResult.note && (
                <p className="pt-2 border-t border-border/60 text-muted-foreground">
                  {verifyResult.note}
                </p>
              )}

              {!verifyResult.error && !verifyResult.matchedRow && verifyResult.deviceToken && (
                <p className="pt-2 border-t border-border/60 text-muted-foreground">
                  This token isn't saved for your account. Tap{" "}
                  <span className="font-semibold">Re-register device with FCM</span> below
                  to upsert it.
                </p>
              )}
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
          {rlsDiag && (
            <div
              className={`rounded-lg border p-3 space-y-2 text-xs ${
                rlsDiag.isRls
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <XCircle
                    className={`w-4 h-4 ${
                      rlsDiag.isRls ? "text-destructive" : "text-muted-foreground"
                    }`}
                  />
                  {rlsDiag.isRls ? "RLS / permission error" : "Database error"}
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {rlsDiag.operation}
                  </Badge>
                </h4>
                {rlsDiag.code && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {rlsDiag.code}
                  </Badge>
                )}
              </div>
              <p className="font-mono text-destructive break-all">{rlsDiag.message}</p>
              {rlsDiag.details && (
                <p className="text-muted-foreground">
                  <span className="font-semibold">Details:</span> {rlsDiag.details}
                </p>
              )}
              {rlsDiag.hint && (
                <p className="text-muted-foreground">
                  <span className="font-semibold">Hint:</span> {rlsDiag.hint}
                </p>
              )}
              <div className="pt-2 border-t border-border/60">
                <p className="font-semibold mb-1">How to fix</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  {rlsDiag.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
              <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Expected user_id: <span className="font-mono">{user.id}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRlsDiag(null);
                    setLastError(null);
                  }}
                  className="h-6 text-[10px]"
                >
                  Dismiss
                </Button>
              </div>
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

          {/* Market deep-link push */}
          <div className="pt-2 border-t border-border space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Market deep-link push</h3>
              <p className="text-xs text-muted-foreground">
                Search a market, then send a push to your own device. Tapping the
                notification opens <span className="font-mono">/market/&lt;id&gt;</span>.
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={marketQuery}
                onChange={(e) => {
                  setMarketQuery(e.target.value);
                  setSelectedMarket(null);
                }}
                placeholder="Search markets by title…"
                className="pl-8 h-9 text-sm"
              />
            </div>

            {searchingMarkets && (
              <div className="flex justify-center py-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!selectedMarket && marketResults.length > 0 && (
              <div className="space-y-1 max-h-56 overflow-y-auto rounded border border-border p-1">
                {marketResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMarket({ id: m.id, title: m.title });
                      setMarketResults([]);
                      setMarketQuery(m.title);
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left text-xs"
                  >
                    {m.image_url ? (
                      <img
                        src={m.image_url}
                        alt=""
                        className="w-7 h-7 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded bg-muted shrink-0" />
                    )}
                    <span className="flex-1 truncate">{m.title}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedMarket && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-2 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-medium truncate">{selectedMarket.title}</p>
                  <p className="font-mono text-[10px] text-muted-foreground truncate">
                    /market/{selectedMarket.id}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedMarket(null);
                    setMarketQuery("");
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            )}

            <Button
              onClick={handleSendMarketPush}
              disabled={!selectedMarket || sendingMarketPush || tokens.length === 0}
              variant="secondary"
              className="w-full"
            >
              {sendingMarketPush ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send market deep-link push
                </>
              )}
            </Button>
            {tokens.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                You need at least one registered token to send a push.
              </p>
            )}

            {marketPushResult && (
              <div className="space-y-2 text-xs rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  {marketPushResult.ok ? (
                    <Badge>Sent</Badge>
                  ) : (
                    <Badge variant="destructive">Failed</Badge>
                  )}
                </div>
                {typeof marketPushResult.sent === "number" && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Delivered / Expired</span>
                    <span className="font-mono">
                      {marketPushResult.sent} / {marketPushResult.expired ?? 0}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Deep-link</span>
                  <Link
                    to={marketPushResult.deep_link}
                    className="font-mono text-primary hover:underline truncate flex items-center gap-1"
                  >
                    <span className="truncate">{marketPushResult.deep_link}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </Link>
                </div>
                <button
                  onClick={() => copy(marketPushResult.deep_link)}
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy deep-link
                </button>
                {marketPushResult.hint && (
                  <p className="text-xs text-muted-foreground italic pt-1 border-t border-border">
                    {marketPushResult.hint}
                  </p>
                )}
                {marketPushResult.error && (
                  <p className="text-xs text-destructive font-mono break-all">
                    {marketPushResult.error}
                  </p>
                )}
                {marketPushResult.results && marketPushResult.results.length > 0 && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-muted-foreground">
                      Per-token results ({marketPushResult.results.length})
                    </summary>
                    <pre className="mt-2 overflow-auto text-[10px] bg-background p-2 rounded">
                      {JSON.stringify(marketPushResult.results, null, 2)}
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
