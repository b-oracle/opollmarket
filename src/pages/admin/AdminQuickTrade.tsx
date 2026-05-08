import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Zap, TrendingUp, TrendingDown, Users, DollarSign, Timer, BarChart3, Trophy, Flame, CheckCircle, RotateCcw, Info, Gift } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import AdminPagination from "@/components/admin/AdminPagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CryptoRoundConfigPanel from "@/components/admin/CryptoRoundConfigPanel";

type RangeKey = "7d" | "30d" | "all";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "all", label: "All", days: null },
];

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];
const PAGE_SIZE = 15;

interface RoundRow {
  id: string;
  asset: string;
  duration_seconds: number;
  status: string;
  result: string | null;
  open_price: number | null;
  close_price: number | null;
  created_at: string;
  locks_at: string;
  resolved_at: string | null;
}

interface BetRow {
  id: string;
  user_id: string;
  round_id: string;
  side: string;
  amount: number;
  payout: number | null;
  status: string;
  streak: number;
  created_at: string;
}

const AdminQuickTrade = () => {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("30d");
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [bets, setBets] = useState<BetRow[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [bonusTxs, setBonusTxs] = useState<{ user_id: string; amount: number; created_at: string }[]>([]);
  const [roundPage, setRoundPage] = useState(1);
  const [betPage, setBetPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"overview" | "rounds" | "trades">("overview");

  useEffect(() => {
    const fetch = async () => {
      const fetchAllData = async (table: any, selectCols?: string) => {
        let allData: any[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          const query = selectCols
            ? supabase.from(table).select(selectCols).order("created_at", { ascending: false }).range(page * 1000, (page + 1) * 1000 - 1)
            : supabase.from(table).select("*").order("created_at", { ascending: false }).range(page * 1000, (page + 1) * 1000 - 1);
          const { data } = await query;
          if (data && data.length > 0) {
            allData = [...allData, ...data];
            page++;
            if (data.length < 1000) hasMore = false;
          } else {
            hasMore = false;
          }
        }
        return allData;
      };

      const [roundData, betData, bonusTxData] = await Promise.all([
        fetchAllData("quick_rounds"),
        fetchAllData("quick_bets"),
        supabase.from("transactions").select("user_id, amount, created_at").eq("type", "qt_one_sided_bonus").eq("status", "confirmed").then(r => r.data || []),
      ]);
      setRounds(roundData || []);
      setBets(betData || []);
      setBonusTxs(bonusTxData as any[]);

      const userIds = [...new Set((betData || []).map(b => b.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name, email").in("id", userIds);
        setProfileMap(new Map((profiles || []).map(p => [p.id, p.display_name || p.email || p.id.slice(0, 8)])));
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const stats = useMemo(() => {
    const selectedRange = RANGES.find(r => r.key === range)!;
    const days = selectedRange.days;
    let cutoff = "";
    if (days) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      cutoff = d.toISOString();
    }

    const filteredRounds = days ? rounds.filter(r => r.created_at >= cutoff) : rounds;
    const filteredBets = days ? bets.filter(b => b.created_at >= cutoff) : bets;

    const totalRounds = filteredRounds.length;
    const resolvedRounds = filteredRounds.filter(r => r.status === "resolved").length;
    const totalBets = filteredBets.length;
    const totalWagered = filteredBets.reduce((sum, b) => sum + Number(b.amount), 0);
    const totalPayout = filteredBets.filter(b => b.status === "won").reduce((sum, b) => sum + Number(b.payout || 0), 0);
    const totalRefunded = filteredBets.filter(b => b.status === "refunded").reduce((sum, b) => sum + Number(b.payout || 0), 0);
    const filteredBonusTxs = days ? bonusTxs.filter(t => t.created_at >= cutoff) : bonusTxs;
    const totalBonusPaid = filteredBonusTxs.reduce((sum, t) => sum + Number(t.amount), 0);
    const platformProfit = totalWagered - totalPayout - totalRefunded - totalBonusPaid;
    const uniqueTraders = new Set(filteredBets.map(b => b.user_id)).size;
    const wonBets = filteredBets.filter(b => b.status === "won").length;
    const lostBets = filteredBets.filter(b => b.status === "lost").length;

    // Asset breakdown
    const assetMap = new Map<string, number>();
    filteredRounds.forEach(r => assetMap.set(r.asset, (assetMap.get(r.asset) || 0) + 1));
    const assetData = Array.from(assetMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Daily activity
    const dayMap = new Map<string, { rounds: number; bets: number; volume: number }>();
    filteredRounds.forEach(r => {
      const day = r.created_at.slice(0, 10);
      const e = dayMap.get(day) || { rounds: 0, bets: 0, volume: 0 };
      e.rounds++;
      dayMap.set(day, e);
    });
    filteredBets.forEach(b => {
      const day = b.created_at.slice(0, 10);
      const e = dayMap.get(day) || { rounds: 0, bets: 0, volume: 0 };
      e.bets++;
      e.volume += Number(b.amount);
      dayMap.set(day, e);
    });

    const numDays = days || 30;
    const chartData = Array.from({ length: numDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (numDays - 1 - i));
      const key = d.toISOString().slice(0, 10);
      const e = dayMap.get(key) || { rounds: 0, bets: 0, volume: 0 };
      return {
        date: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
        ...e,
      };
    });

    // Top traders by profit (settled bets only + bonus transactions)
    const settledBets = filteredBets.filter(b => b.status === "won" || b.status === "lost" || b.status === "refunded");
    const traderMap = new Map<string, { wagered: number; won: number; refunded: number; bonus: number; bets: number }>();
    settledBets.forEach(b => {
      const e = traderMap.get(b.user_id) || { wagered: 0, won: 0, refunded: 0, bonus: 0, bets: 0 };
      e.wagered += Number(b.amount);
      e.bets++;
      if (b.status === "won") e.won += Number(b.payout || 0);
      if (b.status === "refunded") e.refunded += Number(b.payout || 0);
      traderMap.set(b.user_id, e);
    });
    // Add bonus transactions per user
    const filteredBonusByUser = new Map<string, number>();
    filteredBonusTxs.forEach((t: any) => {
      const uid = t.user_id;
      if (uid) filteredBonusByUser.set(uid, (filteredBonusByUser.get(uid) || 0) + Number(t.amount));
    });
    for (const [uid, bonus] of filteredBonusByUser.entries()) {
      const e = traderMap.get(uid);
      if (e) e.bonus = bonus;
    }
    const topTraders = Array.from(traderMap.entries())
      .map(([id, d]) => ({ id, name: profileMap.get(id) || id.slice(0, 8), profit: (d.won + d.refunded + d.bonus) - d.wagered, bets: d.bets, wagered: d.wagered }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    return { totalRounds, resolvedRounds, totalBets, totalWagered, totalPayout, totalRefunded, totalBonusPaid, platformProfit, uniqueTraders, wonBets, lostBets, assetData, chartData, topTraders };
  }, [rounds, bets, range, profileMap]);

  const paginatedRounds = useMemo(() => {
    const start = (roundPage - 1) * PAGE_SIZE;
    return rounds.slice(start, start + PAGE_SIZE);
  }, [rounds, roundPage]);

  const paginatedBets = useMemo(() => {
    const start = (betPage - 1) * PAGE_SIZE;
    return bets.slice(start, start + PAGE_SIZE);
  }, [bets, betPage]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const countCards = [
    { label: "Total Rounds", value: stats.totalRounds, icon: Timer, color: "text-primary" },
    { label: "Total Trades", value: stats.totalBets, icon: Zap, color: "text-chart-2" },
    { label: "Unique Traders", value: stats.uniqueTraders, icon: Users, color: "text-chart-3" },
    { label: "Resolved Rounds", value: stats.resolvedRounds, icon: CheckCircle, color: "text-chart-4" },
  ];

  const finCards: { label: string; value: string; icon: any; color: string; tooltip?: string }[] = [
    { label: "Total Wagered", value: `$${stats.totalWagered.toFixed(2)}`, icon: DollarSign, color: "text-chart-4" },
    { label: "Total Payouts", value: `$${stats.totalPayout.toFixed(2)}`, icon: TrendingUp, color: "text-primary" },
    { label: "Total Refunded", value: `$${stats.totalRefunded.toFixed(2)}`, icon: RotateCcw, color: "text-muted-foreground" },
    { label: "Bonus Paid", value: `$${stats.totalBonusPaid.toFixed(2)}`, icon: Gift, color: "text-chart-2", tooltip: "0.5% bonus paid to winners in one-sided markets (no losers)" },
    { label: "Platform Profit", value: `$${stats.platformProfit.toFixed(2)}`, icon: BarChart3, color: stats.platformProfit >= 0 ? "text-green-500" : "text-red-500", tooltip: "Wagered - Payouts - Refunded - Bonus Paid" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="w-6 h-6 text-primary" /> Quick Trade</h1>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${range === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <CryptoRoundConfigPanel />

      {/* Stats - Row 1: Counts */}
      <TooltipProvider>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {countCards.map(c => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{c.label}</span>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <span className="text-lg font-bold">{c.value}</span>
            </div>
          ))}
        </div>

        {/* Stats - Row 2: Financials */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {finCards.map(c => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                  {c.label}
                  {c.tooltip && (
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="w-3 h-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-xs">{c.tooltip}</TooltipContent>
                    </Tooltip>
                  )}
                </span>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <span className={`text-lg font-bold ${c.label === "Platform Profit" ? c.color : ""}`}>{c.value}</span>
            </div>
          ))}
        </div>
      </TooltipProvider>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 w-fit">
        {([{ key: "overview", label: "Overview" }, { key: "rounds", label: "Rounds" }, { key: "trades", label: "Trades" }] as const).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Volume chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Daily Volume & Trades</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.chartData}>
                    <defs>
                      <linearGradient id="fillVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Area type="monotone" dataKey="volume" name="Volume" stroke="hsl(var(--primary))" fill="url(#fillVol)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Asset pie */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Rounds by Asset</h3>
              <div className="h-52 flex items-center justify-center">
                {stats.assetData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.assetData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {stats.assetData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground">No data</p>}
              </div>
              <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
                {stats.assetData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Win/Loss + Top Traders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Win / Loss Distribution</h3>
              <div className="flex items-center gap-6 justify-center py-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">{stats.wonBets}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Wins</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-destructive">{stats.lostBets}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Losses</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-muted-foreground">{stats.totalBets - stats.wonBets - stats.lostBets}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Pending</div>
                </div>
              </div>
              {stats.totalBets > 0 && (
                <div className="h-2 rounded-full overflow-hidden flex bg-muted mt-2">
                  <div className="bg-green-500" style={{ width: `${(stats.wonBets / stats.totalBets) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(stats.lostBets / stats.totalBets) * 100}%` }} />
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Trophy className="w-4 h-4 text-chart-4" /> Top Traders by Profit</h3>
              {stats.topTraders.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.topTraders.slice(0, 5).map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate">{t.name}</span>
                          <span className={`text-xs font-semibold ${t.profit >= 0 ? "text-green-500" : "text-red-500"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{t.bets} trades · ${t.wagered.toFixed(0)} wagered</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rounds" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Asset</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Result</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Open / Close</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Created</th>
              </tr></thead>
              <tbody>
                {paginatedRounds.map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-semibold">{r.asset}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.duration_seconds}s</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.status === "resolved" ? "bg-chart-3/10 text-chart-3" : r.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.result ? (
                        <span className={`flex items-center gap-1 text-xs font-semibold ${r.result === "up" ? "text-chart-3" : "text-destructive"}`}>
                          {r.result === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {r.result}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {r.open_price != null ? `$${Number(r.open_price).toLocaleString()}` : "—"} / {r.close_price != null ? `$${Number(r.close_price).toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rounds.length > PAGE_SIZE && (
            <div className="p-4 border-t border-border">
              <AdminPagination page={roundPage} totalItems={rounds.length} pageSize={PAGE_SIZE} onPageChange={setRoundPage} />
            </div>
          )}
        </div>
      )}

      {activeTab === "trades" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Side</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Payout</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Streak</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th>
              </tr></thead>
              <tbody>
                {paginatedBets.map(b => (
                  <tr key={b.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium truncate max-w-[150px]">{profileMap.get(b.user_id) || b.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs font-semibold ${b.side === "up" ? "text-chart-3" : "text-destructive"}`}>
                        {b.side === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {b.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">${Number(b.amount).toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono">{b.payout != null ? `$${Number(b.payout).toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${b.status === "won" ? "bg-chart-3/10 text-chart-3" : b.status === "lost" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {b.streak > 1 ? <span className="flex items-center gap-1 text-xs font-semibold text-amber-500"><Flame className="w-3 h-3" />{b.streak}×</span> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bets.length > PAGE_SIZE && (
            <div className="p-4 border-t border-border">
              <AdminPagination page={betPage} totalItems={bets.length} pageSize={PAGE_SIZE} onPageChange={setBetPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminQuickTrade;
