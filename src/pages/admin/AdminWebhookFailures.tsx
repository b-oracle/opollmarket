import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type WebhookFailure = {
  id: string;
  provider: string;
  event_type: string;
  status: string;
  reference: string | null;
  transaction_id: string | null;
  user_id: string | null;
  requested_amount: number | null;
  credited_amount: number | null;
  message: string | null;
  payload: unknown;
  error: string | null;
  stack: string | null;
  created_at: string;
};

type ProviderFilter = "all" | "flutterwave" | "nowpayments" | "payaza";
type SeverityFilter = "all" | "error" | "warning";

const PAGE_SIZE = 50;

export default function AdminWebhookFailures() {
  const [rows, setRows] = useState<WebhookFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("webhook_logs")
        .select(
          "id, provider, event_type, status, reference, transaction_id, user_id, requested_amount, credited_amount, message, payload, error, stack, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (severity === "all") {
        query = query.in("status", ["error", "warning"]);
      } else {
        query = query.eq("status", severity);
      }
      if (provider !== "all") {
        query = query.eq("provider", provider);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as WebhookFailure[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [provider, severity]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const errorCount = rows.filter((r) => r.status === "error").length;
  const warningCount = rows.filter((r) => r.status === "warning").length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            Webhook Failures
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Last {PAGE_SIZE} failed webhook events with payloads and stack traces.
          </p>
        </div>
        <Button onClick={fetchRows} variant="outline" size="sm" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Errors (visible)</div>
          <div className="text-2xl font-bold text-destructive">{errorCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Warnings (visible)</div>
          <div className="text-2xl font-bold text-warning">{warningCount}</div>
        </Card>
        <Card className="p-4 col-span-2 md:col-span-1">
          <div className="text-xs text-muted-foreground">Total returned</div>
          <div className="text-2xl font-bold">{rows.length}</div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Tabs value={provider} onValueChange={(v) => setProvider(v as ProviderFilter)}>
          <TabsList>
            <TabsTrigger value="all">All providers</TabsTrigger>
            <TabsTrigger value="flutterwave">Flutterwave</TabsTrigger>
            <TabsTrigger value="nowpayments">NowPayments</TabsTrigger>
            <TabsTrigger value="payaza">Payaza</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={severity} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="error">Errors</TabsTrigger>
            <TabsTrigger value="warning">Warnings</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Failures list */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <XCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <div className="font-medium">No webhook failures 🎉</div>
          <div className="text-sm mt-1">
            Adjust filters above to look at a different slice.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isOpen = expanded.has(row.id);
            return (
              <Card key={row.id} className="overflow-hidden">
                <Collapsible open={isOpen} onOpenChange={() => toggle(row.id)}>
                  <CollapsibleTrigger className="w-full text-left">
                    <div className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors">
                      <div className="mt-0.5">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={row.status === "error" ? "destructive" : "secondary"}
                          >
                            {row.status}
                          </Badge>
                          <Badge variant="outline">{row.provider}</Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.event_type}
                          </span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatDistanceToNow(new Date(row.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        {row.message && (
                          <div className="text-sm break-words">{row.message}</div>
                        )}
                        {row.error && !row.message && (
                          <div className="text-sm text-destructive font-mono break-words">
                            {row.error}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {row.reference && <span>ref: {row.reference}</span>}
                          {row.requested_amount != null && (
                            <span>requested: ${row.requested_amount}</span>
                          )}
                          {row.credited_amount != null && (
                            <span>credited: ${row.credited_amount}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t p-4 space-y-3 bg-muted/30">
                      <DetailLine label="Logged at">
                        {format(new Date(row.created_at), "yyyy-MM-dd HH:mm:ss")}
                      </DetailLine>
                      {row.user_id && (
                        <DetailLine label="User ID">
                          <code className="text-xs">{row.user_id}</code>
                        </DetailLine>
                      )}
                      {row.transaction_id && (
                        <DetailLine label="Transaction ID">
                          <code className="text-xs">{row.transaction_id}</code>
                        </DetailLine>
                      )}
                      {row.error && (
                        <CodeBlock label="Error" content={row.error} variant="error" />
                      )}
                      {row.stack && (
                        <CodeBlock label="Stack trace" content={row.stack} />
                      )}
                      {row.payload != null && (
                        <CodeBlock
                          label="Payload"
                          content={JSON.stringify(row.payload, null, 2)}
                        />
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 text-sm">
      <span className="text-muted-foreground min-w-[120px]">{label}:</span>
      <span className="break-all">{children}</span>
    </div>
  );
}

function CodeBlock({
  label,
  content,
  variant,
}: {
  label: string;
  content: string;
  variant?: "error";
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <pre
        className={`text-xs p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-words max-h-80 overflow-y-auto ${
          variant === "error"
            ? "bg-destructive/10 text-destructive border border-destructive/20"
            : "bg-background border"
        }`}
      >
        {content}
      </pre>
    </div>
  );
}
