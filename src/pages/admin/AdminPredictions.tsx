import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, TrendingDown, Users, DollarSign, BarChart3, Trophy, ShoppingBag } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import AdminPagination from "@/components/admin/AdminPagination";

type RangeKey = "7d" | "30d" | "all";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "all", label: "All", days: null },
];

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5, 280 65% 60%))"];
const PAGE_SIZE = 15;

interface TxRow {
  id: string;
  user_id: string;
  market_id: string | null;
  type: string;
  amount: number;
  side: string | null;
  shares: number | null;
  price: number | null;
  status: string;
  created_at: string;
  is_copy_trade: boolean;
}

interface MarketRow {
  id: string;
  title: string;
  category: string;
  status: string;
  volume: number;
  participants: number;
  created_at: string;
}

const AdminPredictions = () => {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("30d");
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());
  const [marketPage, setMarketPage] = useState(1);
  const [betPage, setBetPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"overview" | "markets" | "predictions">("overview");

  useEffect(() => {
    const fetchAll = async () => {
      const fetchPaginated = async (table: "transactions" | "markets", select: string, filters?: (q: any) => any) => {
        let allData: any[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          let q = (supabase.from(table) as any).select(select).order("created_at", { ascending: false }).range(page * 1000, (page + 1) * 1000 - 1);
          if (filters) q = filters(q);
          const { data } = await q;
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

      const [txData, marketData] = await Promise.all([
        fetchPaginated("transactions", "id, user_id, market_id, type, amount, side, shares, price, status, created_at, is_copy_trade", (q: any) => q.in("type", ["buy", "sell", "payout", "refund", "commission"]).eq("status", "confirmed")),
        fetchPaginated("markets", "id, title, category, status, volume, participants, created_at"),
      ]);

      setTransactions(txData || []);
      setMarkets(marketData || []);

      const userIds = [...new Set((txData || []).map((t: any) => t.user_id))];
      if (userIds.length > 0) {
        const batches = [];
        for (let i = 0; i < userIds.length; i += 100) {
          batches.push(supabase.from("profiles").select("id, display_name, email").in("id", userIds.slice(i, i + 100)));
        }
        const results = await Promise.all(batches);
        const map = new Map<string, string>();
        results.forEach(({ data }) => (data || []).forEach((p: any) => map.set(p.id, p.display_name || p.email || p.id.slice(0, 8))));
        setProfileMap(map);
      }
      setLoading(false);
    };
    fetchAll();
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

    const filteredTx = days ? transactions.filter(t => t.created_at >= cutoff) : transactions;
    const filteredMarkets = days ? markets.filter(m => m.created_at >= cutoff) : markets;

    const buys = filteredTx.filter(t => t.type === "buy");
    const payouts = filteredTx.filter(t => t.type === "payout");
    const refunds = filteredTx.filter(t => t.type === "refund");

    const totalMarkets = filteredMarkets.length;
    const totalBets = buys.length;
    const uniqueTraders = new Set(buys.map(b => b.user_id)).size;
    const totalWagered = buys.reduce((s, b) => s + Number(b.amount), 0);
    const totalPayouts = payouts.reduce((s, b) => s + Number(b.amount), 0);
    const totalRefunds = refunds.reduce((s, b) => s + Number(b.amount), 0);
    const platformProfit = totalWagered - totalPayouts - totalRefunds;

    // Category breakdown
    const catMap = new Map<string, number>();
    filteredMarkets.forEach(m => catMap.set(m.category, (catMap.get(m.category) || 0) + 1));
    const categoryData = Array.from(catMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Daily activity
    const dayMap = new Map<string, { bets: number; volume: number }>();
    buys.forEach(b => {
      const day = b.created_at.slice(0, 10);
      const e = dayMap.get(day) || { bets: 0, volume: 0 };
      e.bets++;
      e.volume += Number(b.amount);
      dayMap.set(day, e);
    });

    const numDays = days || 30;
    const chartData = Array.from({ length: numDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (numDays - 1 - i));
      const key = d.toISOString().slice(0, 10);
      const e = dayMap.get(key) || { bets: 0, volume: 0 };
      return { date: d.toLocaleDateString("en", { month: "short", day: "numeric" }), ...e };
    });

    // Top traders by profit
    const traderMap = new Map<string, { wagered: number; won: number; bets: number }>();
    buys.forEach(b => {
      const e = traderMap.get(b.user_id) || { wagered: 0, won: 0, bets: 0 };
      e.wagered += Number(b.amount);
      e.bets++;
      traderMap.set(b.user_id, e);
    });
    payouts.forEach(p => {
      const e = traderMap.get(p.user_id) || { wagered: 0, won: 0, bets: 0 };
      e.won += Number(p.amount);
      traderMap.set(p.user_id, e);
    });
    const topTraders = Array.from(traderMap.entries())
      .map(([id, d]) => ({ id, name: profileMap.get(id) || id.slice(0, 8), profit: d.won - d.wagered, bets: d.bets, wagered: d.wagered }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    // Resolved stats
    const resolvedMarkets = filteredMarkets.filter(m => m.status === "resolved").length;
    const cancelledMarkets = filteredMarkets.filter(m => m.status === "cancelled").length;
    const activeMarkets = filteredMarkets.filter(m => m.status === "active").length;

    return { totalMarkets, totalBets, uniqueTraders, totalWagered, totalPayouts, platformProfit, categoryData, chartData, topTraders, resolvedMarkets, cancelledMarkets, activeMarkets };
  }, [transactions, markets, range, profileMap]);

  const sortedMarkets = useMemo(() => [...markets].sort((a, b) => b.volume - a.volume), [markets]);
  const paginatedMarkets = useMemo(() => {
    const start = (marketPage - 1) * PAGE_SIZE;
    return sortedMarkets.slice(start, start + PAGE_SIZE);
  }, [sortedMarkets, marketPage]);

  const buyTxs = useMemo(() => transactions.filter(t => t.type === "buy"), [transactions]);
  const paginatedBets = useMemo(() => {
    const start = (betPage - 1) * PAGE_SIZE;
    return buyTxs.slice(start, start + PAGE_SIZE);
  }, [buyTxs, betPage]);

  const marketTitleMap = useMemo(() => new Map(markets.map(m => [m.id, m.title])), [markets]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const cards = [
    { label: "Total Markets", value: stats.totalMarkets, icon: ShoppingBag, color: "text-primary" },
    { label: "Total Bets", value: stats.totalBets, icon: BarChart3, color: "text-blue-500" },
    { label: "Unique Traders", value: stats.uniqueTraders, icon: Users, color: "text-emerald-500" },
    { label: "Total Wagered", value: `$${stats.totalWagered.toFixed(2)}`, icon: DollarSign, color: "text-amber-500" },
    { label: "Total Payouts", value: `$${stats.totalPayouts.toFixed(2)}`, icon: TrendingUp, color: "text-purple-500" },
    { label: "Platform Profit", value: `$${stats.platformProfit.toFixed(2)}`, icon: BarChart3, color: stats.platformProfit >= 0 ? "text-emerald-500" : "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="w-6 h-6 text-primary" /> Predictions</h1>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${range === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <span className="text-lg font-bold">{c.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 w-fit">
        {([{ key: "overview", label: "Overview" }, { key: "markets", label: "Markets" }, { key: "predictions", label: "Predictions" }] as const).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Volume chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Daily Volume & Bets</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.chartData}>
                    <defs>
                      <linearGradient id="fillPredVol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Area type="monotone" dataKey="volume" name="Volume" stroke="hsl(var(--primary))" fill="url(#fillPredVol)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category pie */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Markets by Category</h3>
              <div className="h-52 flex items-center justify-center">
                {stats.categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {stats.categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground">No data</p>}
              </div>
              <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
                {stats.categoryData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground capitalize">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Market Status + Top Traders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Market Status Distribution</h3>
              <div className="flex items-center gap-6 justify-center py-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{stats.activeMarkets}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Active</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-500">{stats.resolvedMarkets}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Resolved</div>
                </div>
                <div className="w-px h-10 bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-destructive">{stats.cancelledMarkets}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Cancelled</div>
                </div>
              </div>
              {stats.totalMarkets > 0 && (
                <div className="h-2 rounded-full overflow-hidden flex bg-muted mt-2">
                  <div className="bg-primary" style={{ width: `${(stats.activeMarkets / stats.totalMarkets) * 100}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${(stats.resolvedMarkets / stats.totalMarkets) * 100}%` }} />
                  <div className="bg-destructive" style={{ width: `${(stats.cancelledMarkets / stats.totalMarkets) * 100}%` }} />
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Top Traders by Profit</h3>
              {stats.topTraders.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.topTraders.slice(0, 5).map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate">{t.name}</span>
                          <span className={`text-xs font-semibold ${t.profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{t.bets} bets · ${t.wagered.toFixed(0)} wagered</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "markets" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Volume</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Participants</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Created</th>
              </tr></thead>
              <tbody>
                {paginatedMarkets.map(m => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium truncate max-w-[220px]">{m.title}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{m.category}</td>
                    <td className="px-4 py-3 font-mono">${Number(m.volume).toFixed(2)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.participants}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        m.status === "active" ? "bg-primary/10 text-primary" :
                        m.status === "resolved" ? "bg-emerald-500/10 text-emerald-500" :
                        m.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>{m.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedMarkets.length > PAGE_SIZE && (
            <div className="p-4 border-t border-border">
              <AdminPagination page={marketPage} totalItems={sortedMarkets.length} pageSize={PAGE_SIZE} onPageChange={setMarketPage} />
            </div>
          )}
        </div>
      )}

      {activeTab === "predictions" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Market</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Side</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Shares</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th>
              </tr></thead>
              <tbody>
                {paginatedBets.map(b => (
                  <tr key={b.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium truncate max-w-[120px]">{profileMap.get(b.user_id) || b.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 truncate max-w-[180px] text-muted-foreground">{b.market_id ? (marketTitleMap.get(b.market_id) || b.market_id.slice(0, 8)) : "—"}</td>
                    <td className="px-4 py-3">
                      {b.side ? (
                        <span className={`flex items-center gap-1 text-xs font-semibold ${b.side === "yes" ? "text-emerald-500" : "text-destructive"}`}>
                          {b.side === "yes" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {b.side}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono">${Number(b.amount).toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{b.price != null ? `$${Number(b.price).toFixed(2)}` : "—"}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{b.shares != null ? Number(b.shares).toFixed(1) : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {buyTxs.length > PAGE_SIZE && (
            <div className="p-4 border-t border-border">
              <AdminPagination page={betPage} totalItems={buyTxs.length} pageSize={PAGE_SIZE} onPageChange={setBetPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPredictions;
