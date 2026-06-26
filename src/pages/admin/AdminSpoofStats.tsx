import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save, Search, TrendingUp, Users, Activity } from "lucide-react";

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(2)}`;

export default function AdminSpoofStats() {
  const qc = useQueryClient();

  // Global overrides
  const { data: overrides, isLoading: ovLoading } = useQuery({
    queryKey: ["platform-stats-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_stats_overrides" as any)
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [volume, setVolume] = useState("0");
  const [users, setUsers] = useState("0");
  const [marketsBoost, setMarketsBoost] = useState("0");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!overrides) return;
    setVolume(String(overrides.spoof_volume ?? 0));
    setUsers(String(overrides.spoof_users ?? 0));
    setMarketsBoost(String(overrides.spoof_markets ?? 0));
    setEnabled(!!overrides.enabled);
  }, [overrides]);

  const saveOverrides = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_platform_overrides" as any, {
      _volume: parseFloat(volume) || 0,
      _users: parseInt(users) || 0,
      _markets: parseInt(marketsBoost) || 0,
      _enabled: enabled,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: "Landing page stats updated." });
    qc.invalidateQueries({ queryKey: ["platform-stats-overrides"] });
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
  };

  // Per-market spoof
  const [search, setSearch] = useState("");
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ["admin-spoof-markets", search],
    queryFn: async () => {
      let q = supabase
        .from("markets")
        .select("id,title,volume,participants,simulated_volume,simulated_participants,status,image_url")
        .order("created_at", { ascending: false })
        .limit(50);
      if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const [edits, setEdits] = useState<Record<string, { v: string; p: string }>>({});
  const setEdit = (id: string, patch: Partial<{ v: string; p: string }>) =>
    setEdits((e) => ({ ...e, [id]: { v: patch.v ?? e[id]?.v ?? "", p: patch.p ?? e[id]?.p ?? "" } }));

  const saveMarket = async (m: any) => {
    const cur = edits[m.id];
    const v = cur?.v !== undefined && cur.v !== "" ? parseFloat(cur.v) : Number(m.simulated_volume) || 0;
    const p = cur?.p !== undefined && cur.p !== "" ? parseInt(cur.p) : Number(m.simulated_participants) || 0;
    const { error } = await supabase.rpc("admin_set_market_spoof" as any, {
      _market_id: m.id,
      _spoof_volume: v,
      _spoof_participants: p,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: `Updated "${m.title.slice(0, 40)}"` });
    setEdits((e) => {
      const n = { ...e };
      delete n[m.id];
      return n;
    });
    qc.invalidateQueries({ queryKey: ["admin-spoof-markets", search] });
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
  };

  const preview = useMemo(() => {
    if (!enabled) return null;
    return {
      volume: parseFloat(volume) || 0,
      users: parseInt(users) || 0,
      markets: parseInt(marketsBoost) || 0,
    };
  }, [enabled, volume, users, marketsBoost]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Spoof Stats</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inflate public-facing volume, user and market counts. Display only — does not affect real balances, trades or payouts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Landing page overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ovLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/40">
                <div>
                  <div className="font-medium text-sm">Spoofing enabled</div>
                  <div className="text-xs text-muted-foreground">Turn off to show only real numbers.</div>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Add to Volume ($)</Label>
                  <Input type="number" min="0" step="100" value={volume} onChange={(e) => setVolume(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Add to Users</Label>
                  <Input type="number" min="0" step="1" value={users} onChange={(e) => setUsers(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Add to Markets</Label>
                  <Input type="number" min="0" step="1" value={marketsBoost} onChange={(e) => setMarketsBoost(e.target.value)} />
                </div>
              </div>

              {preview && (
                <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed">
                  Landing will add <span className="font-semibold text-foreground">{fmt(preview.volume)}</span> volume,{" "}
                  <span className="font-semibold text-foreground">{preview.users.toLocaleString()}</span> users,{" "}
                  <span className="font-semibold text-foreground">{preview.markets.toLocaleString()}</span> markets to the real figures.
                </div>
              )}

              <Button onClick={saveOverrides} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save overrides
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-market simulated volume</CardTitle>
          <p className="text-xs text-muted-foreground">
            Each market's simulated volume adds to its public Volume chip and to the homepage total.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search markets by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {marketsLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <div className="space-y-2">
              {(markets ?? []).map((m) => {
                const e = edits[m.id];
                const dirty = !!e && (e.v !== "" || e.p !== "");
                return (
                  <div key={m.id} className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border bg-card">
                    {m.image_url && (
                      <img src={m.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Real vol {fmt(Number(m.volume) || 0)} · Real participants {m.participants || 0} · {m.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Sim. vol ($)</Label>
                        <Input
                          type="number"
                          min="0"
                          className="h-8 w-28"
                          defaultValue={Number(m.simulated_volume) || 0}
                          onChange={(ev) => setEdit(m.id, { v: ev.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Sim. users</Label>
                        <Input
                          type="number"
                          min="0"
                          className="h-8 w-24"
                          defaultValue={Number(m.simulated_participants) || 0}
                          onChange={(ev) => setEdit(m.id, { p: ev.target.value })}
                        />
                      </div>
                      <Button size="sm" variant={dirty ? "default" : "outline"} onClick={() => saveMarket(m)}>
                        Save
                      </Button>
                    </div>
                  </div>
                );
              })}
              {(markets ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No markets found.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
