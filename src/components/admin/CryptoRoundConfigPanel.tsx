import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Activity, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConfigRow {
  id: string;
  asset: string;
  duration_minutes: number;
  enabled: boolean;
  initial_liquidity_usd: number;
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

/**
 * Admin panel for the Polymarket-style crypto Up/Down round engine.
 * Each row toggles auto-spawning for a (asset × duration) pair and lets the
 * admin tune the seed liquidity per round.
 */
const CryptoRoundConfigPanel = () => {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [spawning, setSpawning] = useState(false);

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

  useEffect(() => { load(); }, []);

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

  const triggerSpawnNow = async () => {
    setSpawning(true);
    const { data, error } = await supabase.functions.invoke("crypto-round-spawner", {
      body: { source: "manual" },
    });
    setSpawning(false);
    if (error) {
      toast({ title: "Spawn failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Spawn triggered",
        description: `Spawned ${data?.spawned ?? 0} new round(s).`,
      });
    }
  };

  const grouped: Record<string, ConfigRow[]> = {};
  for (const r of rows) {
    (grouped[r.asset] ||= []).push(r);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Crypto Up/Down Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Auto-spawned binary AMM markets per asset and duration. New rounds appear in the Crypto category.
          </p>
        </div>
        <button
          onClick={triggerSpawnNow}
          disabled={spawning}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {spawning ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Spawn now
        </button>
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
                {items.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-1 sm:grid-cols-[80px_1fr_140px_60px] items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <span className="font-mono font-semibold text-xs">
                      {DURATION_LABEL[row.duration_minutes] ?? `${row.duration_minutes}m`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.enabled
                        ? "Spawning enabled — a new round opens immediately after each one ends."
                        : "Disabled — no rounds will be created."}
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CryptoRoundConfigPanel;
