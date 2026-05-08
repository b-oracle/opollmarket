import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Activity, Zap, History, CheckCircle2, AlertCircle, MinusCircle, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfigRow {
  id: string;
  asset: string;
  duration_minutes: number;
  enabled: boolean;
  initial_liquidity_usd: number;
}

interface SpawnLogRow {
  id: string;
  asset: string | null;
  duration_minutes: number | null;
  market_id: string | null;
  source: string;
  status: string;
  message: string | null;
  open_price: number | null;
  created_at: string;
}

const DURATION_LABEL: Record<number, string> = {
  5: "5m",
  15: "15m",
  60: "1h",
  1440: "1d",
};

const ASSET_NAME: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  BNB: "BNB",
  XRP: "XRP",
};

const fmtTime = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

const CryptoRoundConfigPanel = () => {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [spawning, setSpawning] = useState(false);
  const [spawningKey, setSpawningKey] = useState<string | null>(null);
  const [logs, setLogs] = useState<SpawnLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [autoSpawnOn, setAutoSpawnOn] = useState<boolean>(true);
  const [savingAutoSpawn, setSavingAutoSpawn] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{ asset: string; duration_minutes: number } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("crypto_round_config")
      .select("id, asset, duration_minutes, enabled, initial_liquidity_usd")
      .order("asset", { ascending: true })
      .order("duration_minutes", { ascending: true });
    if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    setRows((data ?? []) as ConfigRow[]);
    setLoading(false);
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    const { data, error } = await supabase
      .from("crypto_round_spawn_log")
      .select("id, asset, duration_minutes, market_id, source, status, message, open_price, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) setLogs((data ?? []) as SpawnLogRow[]);
    setLogsLoading(false);
  };

  const loadAutoSpawn = async () => {
    const { data } = await supabase
      .from("feature_toggles")
      .select("enabled")
      .eq("feature_key", "crypto_auto_spawn")
      .maybeSingle();
    if (data) setAutoSpawnOn(!!data.enabled);
  };

  const toggleAutoSpawn = async () => {
    const next = !autoSpawnOn;
    setSavingAutoSpawn(true);
    setAutoSpawnOn(next);
    const { error } = await supabase
      .from("feature_toggles")
      .update({ enabled: next })
      .eq("feature_key", "crypto_auto_spawn");
    setSavingAutoSpawn(false);
    if (error) {
      setAutoSpawnOn(!next);
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: next ? "Auto-spawn enabled" : "Auto-spawn paused",
        description: next
          ? "New rounds will spawn automatically after each resolution."
          : "Existing rounds will resolve, but no new ones will start until re-enabled.",
      });
    }
  };

  useEffect(() => {
    load();
    loadLogs();
    loadAutoSpawn();
  }, []);

  const updateRow = async (row: ConfigRow, patch: Partial<ConfigRow>) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("crypto_round_config")
      .update(patch)
      .eq("id", row.id);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    setSavingId(null);
  };

  const triggerSpawnAll = async () => {
    setSpawning(true);
    const { data, error } = await supabase.functions.invoke("crypto-round-spawner", {
      body: { source: "manual_all" },
    });
    setSpawning(false);
    if (error) {
      toast({ title: "Spawn failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Spawn triggered", description: `Spawned ${data?.spawned ?? 0} round(s).` });
    }
    loadLogs();
  };

  const triggerSpawnOne = async (asset: string, duration_minutes: number) => {
    const key = `${asset}-${duration_minutes}`;
    setSpawningKey(key);
    const { data, error } = await supabase.functions.invoke("crypto-round-spawner", {
      body: { source: "manual_one", asset, duration_minutes, force: true },
    });
    setSpawningKey(null);
    if (error) {
      toast({ title: "Spawn failed", description: error.message, variant: "destructive" });
    } else if ((data?.spawned ?? 0) > 0) {
      toast({ title: "Round spawned", description: `${asset} ${DURATION_LABEL[duration_minutes] ?? duration_minutes + "m"} created.` });
    } else {
      toast({
        title: "No round created",
        description: data?.errors?.[0] ?? "See audit log for details.",
        variant: "destructive",
      });
    }
    loadLogs();
  };

  const grouped: Record<string, ConfigRow[]> = {};
  for (const r of rows) (grouped[r.asset] ||= []).push(r);

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
    if (status === "skipped") return <MinusCircle className="w-3.5 h-3.5 text-muted-foreground" />;
    return <AlertCircle className="w-3.5 h-3.5 text-destructive" />;
  };

  return (
    <div className="space-y-4">
      {/* Config */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Crypto Up/Down Engine
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Auto-spawned binary AMM markets per asset and duration. Use "Spawn now" on any row to force-create a fresh round immediately (audit-logged).
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                autoSpawnOn
                  ? "border-primary/30 bg-primary/10"
                  : "border-border bg-muted/40"
              }`}
              title="Master switch — when off, no new rounds spawn automatically after resolution. Per-row toggles below still apply when this is on."
            >
              <span className="text-xs font-bold uppercase tracking-wider">
                {autoSpawnOn ? "Auto-Spawn ON" : "Auto-Spawn PAUSED"}
              </span>
              <button
                onClick={toggleAutoSpawn}
                disabled={savingAutoSpawn}
                className={`w-12 h-6 rounded-full relative transition-colors disabled:opacity-50 ${
                  autoSpawnOn ? "bg-primary" : "bg-muted-foreground/40"
                }`}
                aria-label="Toggle global auto-spawn"
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-background transition-transform ${
                    autoSpawnOn ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <button
              onClick={triggerSpawnAll}
              disabled={spawning}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {spawning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Spawn all enabled
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([asset, items]) => (
              <div key={asset} className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-bold uppercase tracking-wider">
                  {ASSET_NAME[asset] ?? asset} · {asset}
                </div>
                <div className="divide-y divide-border">
                  {items.map((row) => {
                    const key = `${row.asset}-${row.duration_minutes}`;
                    const isSpawning = spawningKey === key;
                    return (
                      <div
                        key={row.id}
                        className="grid grid-cols-1 sm:grid-cols-[70px_1fr_140px_100px_60px] items-center gap-3 px-3 py-2.5 text-sm"
                      >
                        <span className="font-mono font-semibold text-xs">
                          {DURATION_LABEL[row.duration_minutes] ?? `${row.duration_minutes}m`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.enabled
                            ? "Auto-spawning enabled"
                            : "Disabled — only manual spawn will create rounds."}
                        </span>
                        <label className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Liquidity $</span>
                          <input
                            type="number"
                            min={50}
                            step={50}
                            value={row.initial_liquidity_usd}
                            onChange={(e) =>
                              setRows((rs) =>
                                rs.map((r) =>
                                  r.id === row.id
                                    ? { ...r, initial_liquidity_usd: Number(e.target.value) }
                                    : r,
                                ),
                              )
                            }
                            onBlur={(e) =>
                              updateRow(row, { initial_liquidity_usd: Number(e.target.value) })
                            }
                            className="w-20 px-2 py-1 rounded border border-border bg-background text-xs"
                          />
                          {savingId === row.id && <Loader2 className="w-3 h-3 animate-spin" />}
                        </label>
                        <button
                          onClick={() => triggerSpawnOne(row.asset, row.duration_minutes)}
                          disabled={isSpawning}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50 inline-flex items-center gap-1 justify-center"
                        >
                          {isSpawning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          Spawn now
                        </button>
                        <button
                          onClick={() => updateRow(row, { enabled: !row.enabled })}
                          className={`w-12 h-6 rounded-full relative transition-colors ${
                            row.enabled ? "bg-primary" : "bg-muted"
                          }`}
                          aria-label="Toggle"
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-background transition-transform ${
                              row.enabled ? "translate-x-6" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit log */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Spawn Audit Log
          </h3>
          <button
            onClick={loadLogs}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>
        {logsLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No spawn events yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <div className="min-w-[720px] divide-y divide-border text-xs">
              <div className="grid grid-cols-[160px_60px_50px_70px_90px_1fr] gap-2 py-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                <span>Time</span>
                <span>Asset</span>
                <span>Dur</span>
                <span>Source</span>
                <span>Open $</span>
                <span>Status / Message</span>
              </div>
              {logs.map((log) => (
                <div key={log.id} className="grid grid-cols-[160px_60px_50px_70px_90px_1fr] gap-2 py-2 items-start">
                  <span className="font-mono text-[11px] text-muted-foreground">{fmtTime(log.created_at)}</span>
                  <span className="font-semibold">{log.asset ?? "—"}</span>
                  <span className="font-mono">
                    {log.duration_minutes ? (DURATION_LABEL[log.duration_minutes] ?? `${log.duration_minutes}m`) : "—"}
                  </span>
                  <span className="text-muted-foreground">{log.source}</span>
                  <span className="font-mono">{log.open_price != null ? `$${Number(log.open_price).toFixed(2)}` : "—"}</span>
                  <span className="flex items-start gap-1.5 min-w-0">
                    <StatusIcon status={log.status} />
                    <span
                      className={
                        log.status === "success"
                          ? "text-foreground"
                          : log.status === "skipped"
                          ? "text-muted-foreground"
                          : "text-destructive"
                      }
                    >
                      {log.message ?? log.status}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CryptoRoundConfigPanel;
