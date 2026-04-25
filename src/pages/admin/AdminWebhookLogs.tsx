import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { formatRedactedPayload, wasServerRedacted } from "@/lib/payloadRedaction";

type WebhookLog = {
  id: string;
  provider: string;
  event_type: string;
  status: string;
  reference: string | null;
  transaction_id: string | null;
  user_id: string | null;
  requested_amount: number | null;
  credited_amount: number | null;
  bonus_amount: number | null;
  message: string | null;
  payload: unknown;
  error: string | null;
  created_at: string;
};

const PROVIDERS = ["all", "payaza", "nowpayments", "flutterwave"] as const;
const STATUSES = ["all", "info", "success", "warning", "error"] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case "success": return "default";
    case "warning": return "secondary";
    case "error":   return "destructive";
    default:        return "outline";
  }
};

const fmtAmount = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

export default function AdminWebhookLogs() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<typeof PROVIDERS[number]>("all");
  const [status, setStatus] = useState<typeof STATUSES[number]>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("webhook_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (provider !== "all") query = query.eq("provider", provider);
    if (status !== "all") query = query.eq("status", status);
    if (search.trim()) {
      const s = search.trim();
      query = query.or(`reference.ilike.%${s}%,transaction_id.eq.${isUuid(s) ? s : "00000000-0000-0000-0000-000000000000"},user_id.eq.${isUuid(s) ? s : "00000000-0000-0000-0000-000000000000"}`);
    }

    const { data, error } = await query;
    if (error) console.error("Failed to load webhook logs:", error);
    setLogs((data as WebhookLog[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Webhook Logs</h1>
          <p className="text-sm text-muted-foreground">Structured deposit-webhook events for debugging stuck payments.</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as typeof PROVIDERS[number])}
          className="h-9 px-3 rounded-md border border-border bg-background text-sm"
        >
          {PROVIDERS.map((p) => <option key={p} value={p}>{p === "all" ? "All providers" : p}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof STATUSES[number])}
          className="h-9 px-3 rounded-md border border-border bg-background text-sm"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          placeholder="Search by reference / tx id / user id"
          className="flex-1 min-w-[220px]"
        />
        <Button size="sm" onClick={load}>Search</Button>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">No webhook events found.</Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const isOpen = expanded === log.id;
            return (
              <Card key={log.id} className="p-3">
                <button
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={statusVariant(log.status) as never}>{log.status}</Badge>
                    <Badge variant="outline">{log.provider}</Badge>
                    <span className="font-medium">{log.event_type}</span>
                    {log.reference && <code className="text-xs text-muted-foreground truncate max-w-[160px]">ref: {log.reference}</code>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div>Requested: <span className="text-foreground">{fmtAmount(log.requested_amount)}</span></div>
                    <div>Credited: <span className="text-foreground">{fmtAmount(log.credited_amount)}</span></div>
                    <div>Bonus: <span className="text-foreground">{fmtAmount(log.bonus_amount)}</span></div>
                    <div className="truncate">Tx: <span className="text-foreground">{log.transaction_id?.slice(0, 8) ?? "—"}</span></div>
                  </div>
                  {log.message && <div className="mt-1 text-xs">{log.message}</div>}
                  {log.error && <div className="mt-1 text-xs text-destructive">⚠ {log.error}</div>}
                </button>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs">
                    {log.user_id && <div><span className="text-muted-foreground">User ID:</span> <code>{log.user_id}</code></div>}
                    {log.transaction_id && <div><span className="text-muted-foreground">Transaction ID:</span> <code>{log.transaction_id}</code></div>}
                    {log.payload != null && (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-muted-foreground">Payload</span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {wasServerRedacted(log.payload) ? "redacted server-side" : "redacted on display"}
                          </Badge>
                        </div>
                        <pre className="p-2 bg-muted rounded overflow-x-auto max-h-72">{formatRedactedPayload(log.payload)}</pre>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Sensitive fields (secrets, signatures, PII) are masked.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
