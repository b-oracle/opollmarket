import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Cable } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type HealthResp = {
  checked_at: string;
  primary: { configured: boolean; ok: boolean; block: number | null; latency_ms: number; error: string | null };
  fallback: { configured: boolean; ok: boolean; block: number | null; latency_ms: number; error: string | null };
  block_drift: number | null;
  error?: string;
};

const ALERT_CODES = [
  "bsc_rpc_primary_failover",
  "bsc_rpc_total_failure",
  "poller_run_failed",
] as const;

const codeLabel: Record<string, { label: string; tone: "warning" | "critical" | "info" }> = {
  bsc_rpc_primary_failover: { label: "Failovers to backup", tone: "warning" },
  bsc_rpc_total_failure: { label: "Total RPC outages", tone: "critical" },
  poller_run_failed: { label: "Poller run errors", tone: "warning" },
};

function StatusBadge({ ok, configured }: { ok: boolean; configured: boolean }) {
  if (!configured) return <Badge variant="outline" className="bg-muted/30 text-muted-foreground border-muted-foreground/20">Not configured</Badge>;
  return ok
    ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 border"><CheckCircle2 className="w-3 h-3 mr-1" />Healthy</Badge>
    : <Badge className="bg-destructive/15 text-destructive border-destructive/20 border"><XCircle className="w-3 h-3 mr-1" />Down</Badge>;
}

function EndpointCard({
  name, role, data,
}: {
  name: string;
  role: "Primary" | "Fallback";
  data: HealthResp["primary"];
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Cable className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{role}</div>
            <div className="text-sm font-medium truncate">{name}</div>
          </div>
        </div>
        <StatusBadge ok={data.ok} configured={data.configured} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Last block</div>
          <div className="font-mono">{data.block?.toLocaleString() ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Latency</div>
          <div className="font-mono">{data.configured ? `${data.latency_ms} ms` : "—"}</div>
        </div>
      </div>
      {data.error && (
        <div className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1 font-mono break-all">
          {data.error}
        </div>
      )}
    </div>
  );
}

const RpcHealthPanel = () => {
  const { data: health, refetch, isFetching } = useQuery<HealthResp>({
    queryKey: ["bsc-rpc-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("bsc-rpc-health");
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as HealthResp;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: scanState } = useQuery({
    queryKey: ["bsc-deposit-state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bsc_deposit_state" as any)
        .select("last_scanned_block, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { last_scanned_block: number; updated_at: string } | null;
    },
    refetchInterval: 30_000,
  });

  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: alertCounts } = useQuery({
    queryKey: ["bsc-rpc-alert-counts", since24h],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_alerts" as any)
        .select("code, created_at")
        .in("source", ["bsc-deposit-poller", "bsc-deposit-reverify"])
        .in("code", ALERT_CODES as unknown as string[])
        .gte("created_at", since24h)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data as any[]) || [];
      const sinceHour = Date.now() - 3600 * 1000;
      const counts: Record<string, { h1: number; h24: number; lastAt: string | null }> = {};
      for (const code of ALERT_CODES) counts[code] = { h1: 0, h24: 0, lastAt: null };
      for (const r of rows) {
        const bucket = counts[r.code];
        if (!bucket) continue;
        bucket.h24++;
        if (new Date(r.created_at).getTime() >= sinceHour) bucket.h1++;
        if (!bucket.lastAt) bucket.lastAt = r.created_at;
      }
      return counts;
    },
    refetchInterval: 60_000,
  });

  const drift = health?.block_drift;
  const driftWarning = drift != null && drift > 5;
  const scanLag = scanState && health?.primary?.block
    ? Math.max(0, health.primary.block - Number(scanState.last_scanned_block))
    : null;
  const scanStaleMin = scanState?.updated_at
    ? Math.round((Date.now() - new Date(scanState.updated_at).getTime()) / 60000)
    : null;

  return (
    <div className="border border-border bg-card rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">BSC RPC Health & Failover</h3>
          {health?.checked_at && (
            <span className="text-[11px] text-muted-foreground">
              Probed {formatDistanceToNow(new Date(health.checked_at), { addSuffix: true })}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Probe now
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <EndpointCard role="Primary" name="BSC_RPC_URL" data={health?.primary ?? { configured: false, ok: false, block: null, latency_ms: 0, error: null }} />
        <EndpointCard role="Fallback" name="BSC_RPC_URL_FALLBACK" data={health?.fallback ?? { configured: false, ok: false, block: null, latency_ms: 0, error: null }} />
      </div>

      {/* Drift + scan state row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
        <div className="rounded-lg border border-border bg-background/40 p-2.5">
          <div className="text-muted-foreground">Block drift</div>
          <div className={`font-mono text-sm ${driftWarning ? "text-amber-500" : ""}`}>
            {drift != null ? `${drift} blocks` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-2.5">
          <div className="text-muted-foreground">Last scanned block</div>
          <div className="font-mono text-sm">{scanState?.last_scanned_block?.toLocaleString() ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-2.5">
          <div className="text-muted-foreground">Scan lag vs head</div>
          <div className={`font-mono text-sm ${scanLag != null && scanLag > 100 ? "text-amber-500" : ""}`}>
            {scanLag != null ? `${scanLag} blocks` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/40 p-2.5">
          <div className="text-muted-foreground">State updated</div>
          <div className={`font-mono text-sm ${scanStaleMin != null && scanStaleMin > 5 ? "text-amber-500" : ""}`}>
            {scanStaleMin != null ? `${scanStaleMin}m ago` : "—"}
          </div>
        </div>
      </div>

      {/* Alert counters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ALERT_CODES.map((code) => {
          const meta = codeLabel[code];
          const c = alertCounts?.[code];
          const h1 = c?.h1 ?? 0;
          const tone =
            meta.tone === "critical" && (c?.h24 ?? 0) > 0 ? "text-destructive" :
            h1 > 0 ? "text-amber-500" :
            "text-emerald-500";
          return (
            <div key={code} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                {h1 > 0 ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                {meta.label}
              </div>
              <div className={`text-lg font-semibold ${tone}`}>
                {c?.h24 ?? 0}
                <span className="text-xs text-muted-foreground font-normal ml-1">/ 24h</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {h1} in last hour
                {c?.lastAt && ` · last ${formatDistanceToNow(new Date(c.lastAt), { addSuffix: true })}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RpcHealthPanel;
