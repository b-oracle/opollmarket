import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatRedactedPayload } from "@/lib/payloadRedaction";

type Status = "pending" | "delivered" | "failed" | "dead_letter" | "all";

interface WebhookEvent {
  id: string;
  api_key_id: string;
  event_type: string;
  status: string;
  attempts: number;
  response_code: number | null;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  payload: unknown;
  api_keys?: { partner_name: string } | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  delivered: "default",
  pending: "secondary",
  failed: "destructive",
  dead_letter: "destructive",
};

export default function AdminWebhookEvents() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [status, setStatus] = useState<Status>("failed");
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [runningWorker, setRunningWorker] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("webhook_events")
      .select(
        "id, api_key_id, event_type, status, attempts, response_code, next_retry_at, last_attempt_at, last_error, created_at, payload, api_keys(partner_name)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (status !== "all") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      toast.error(`Failed to load events: ${error.message}`);
    } else {
      setEvents((data ?? []) as unknown as WebhookEvent[]);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const requeue = async (id: string) => {
    setRetryingId(id);
    const { data, error } = await supabase.rpc("requeue_webhook_event", { _event_id: id });
    setRetryingId(null);
    if (error) {
      toast.error(`Requeue failed: ${error.message}`);
      return;
    }
    const result = data as { success: boolean; error?: string } | null;
    if (!result?.success) {
      toast.error(result?.error ?? "Requeue failed");
      return;
    }
    toast.success("Event requeued — will retry within 1 minute");
    load();
  };

  const runWorkerNow = async () => {
    setRunningWorker(true);
    const { data, error } = await supabase.functions.invoke("retry-webhooks");
    setRunningWorker(false);
    if (error) {
      toast.error(`Worker failed: ${error.message}`);
      return;
    }
    const r = data as { retried: number; succeeded: number };
    toast.success(`Retried ${r.retried} events (${r.succeeded} succeeded)`);
    load();
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Outbound Webhook Events</h1>
          <p className="text-sm text-muted-foreground">
            Auto-retries failed deliveries with exponential backoff (1m → 5m → 30m → 2h → 12h, then dead-letter).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={runWorkerNow} disabled={runningWorker}>
            {runningWorker ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            Run worker now
          </Button>
        </div>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
        <TabsList>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="dead_letter">Dead-letter</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No events match this filter.</Card>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => {
            const isExpanded = expanded === ev.id;
            const canRequeue = ev.status === "failed" || ev.status === "dead_letter";
            return (
              <Card key={ev.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={STATUS_VARIANT[ev.status] ?? "outline"}>{ev.status}</Badge>
                      <span className="font-mono text-sm">{ev.event_type}</span>
                      <span className="text-xs text-muted-foreground">
                        → {ev.api_keys?.partner_name ?? ev.api_key_id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-x-3">
                      <span>Attempts: {ev.attempts}</span>
                      {ev.response_code != null && <span>HTTP {ev.response_code}</span>}
                      <span>{formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}</span>
                      {ev.next_retry_at && (
                        <span className="font-medium text-foreground">
                          ⟳ Next retry {formatDistanceToNow(new Date(ev.next_retry_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {ev.last_error && (
                      <p className="text-xs text-destructive break-all line-clamp-2">{ev.last_error}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(isExpanded ? null : ev.id)}
                    >
                      {isExpanded ? "Hide" : "Payload"}
                    </Button>
                    {canRequeue && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => requeue(ev.id)}
                        disabled={retryingId === ev.id}
                      >
                        {retryingId === ev.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Requeue
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Outbound payload</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">redacted on display</Badge>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                      {formatRedactedPayload(ev.payload)}
                    </pre>
                    <p className="text-[11px] text-muted-foreground">
                      Sensitive fields (secrets, signatures, PII) are masked for safe preview.
                    </p>
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
