import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Users, MessageSquare, ShoppingBag, Loader2, DollarSign, Activity, Gift, UserPlus, Zap, UserCheck, Heart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

interface Stats {
  totalMarkets: number;
  totalComments: number;
  totalVolume: number;
  activeBoosts: number;
  totalUsers: number;
  totalTransactions: number;
  totalReferrals: number;
  totalRewardsPaid: number;
  quickTradeRounds: number;
  quickTradeBets: number;
  quickTradeVolume: number;
  totalFollows: number;
  totalLikes: number;
}

interface MarketRow {
  category: string;
  volume: number;
  status: string;
  created_at: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryData, setCategoryData] = useState<{ name: string; volume: number; count: number }[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [activityData, setActivityData] = useState<{ date: string; markets: number; bets: number }[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      // Use count queries for all counts (avoids 1000-row limit)
      const [markets, comments, boosts, users, txns, referrals, qtRounds, qtBets, follows, likes] = await Promise.all([
        supabase.from("markets").select("*", { count: "exact", head: true }),
        supabase.from("comments").select("*", { count: "exact", head: true }),
        supabase.from("market_boosts").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("transactions").select("*", { count: "exact", head: true }),
        supabase.from("referral_rewards").select("*", { count: "exact", head: true }),
        supabase.from("quick_rounds").select("*", { count: "exact", head: true }),
        supabase.from("quick_bets").select("*", { count: "exact", head: true }),
        supabase.from("follows").select("*", { count: "exact", head: true }),
        supabase.from("market_likes").select("*", { count: "exact", head: true }),
      ]);

      const { data: marketRows } = await supabase.from("markets").select("category, volume, status, created_at");
      const { data: txnRows } = await supabase.from("transactions").select("created_at, amount");

      // For monetary totals, we need ALL rows — fetch in batches to avoid 1000-row cap
      const fetchAllRows = async <T,>(table: string, select: string, filters?: (q: any) => any): Promise<T[]> => {
        const allRows: T[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          let q = supabase.from(table).select(select).range(from, from + batchSize - 1);
          if (filters) q = filters(q);
          const { data, error } = await q;
          if (error || !data || data.length === 0) break;
          allRows.push(...(data as T[]));
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return allRows;
      };

      const [rewardRows, qtBetRows] = await Promise.all([
        fetchAllRows<{ amount: number }>("referral_rewards", "amount"),
        fetchAllRows<{ amount: number }>("quick_bets", "amount"),
      ]);

      const totalVolume = marketRows?.reduce((sum, m) => sum + Number(m.volume), 0) ?? 0;
      const totalRewardsPaid = rewardRows.reduce((sum, r) => sum + Number(r.amount), 0);
      const quickTradeVolume = qtBetRows.reduce((sum, b) => sum + Number(b.amount), 0);

      setStats({
        totalMarkets: markets.count ?? 0,
        totalComments: comments.count ?? 0,
        totalVolume,
        activeBoosts: boosts.count ?? 0,
        totalUsers: users.count ?? 0,
        totalTransactions: txns.count ?? 0,
        totalReferrals: referrals.count ?? 0,
        totalRewardsPaid,
        quickTradeRounds: qtRounds.count ?? 0,
        quickTradeBets: qtBets.count ?? 0,
        quickTradeVolume,
        totalFollows: follows.count ?? 0,
        totalLikes: likes.count ?? 0,
      });

      // Category breakdown
      if (marketRows) {
        const catMap = new Map<string, { volume: number; count: number }>();
        marketRows.forEach((m) => {
          const existing = catMap.get(m.category) || { volume: 0, count: 0 };
          catMap.set(m.category, { volume: existing.volume + Number(m.volume), count: existing.count + 1 });
        });
        setCategoryData(
          Array.from(catMap.entries())
            .map(([name, d]) => ({ name, ...d }))
            .sort((a, b) => b.volume - a.volume)
        );

        // Status breakdown
        const statusMap = new Map<string, number>();
        marketRows.forEach((m) => statusMap.set(m.status, (statusMap.get(m.status) || 0) + 1));
        setStatusData(Array.from(statusMap.entries()).map(([name, value]) => ({ name, value })));
      }

      // Activity over last 7 days
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().slice(0, 10);
      });

      const marketsByDay = new Map<string, number>();
      marketRows?.forEach((m) => {
        const day = m.created_at.slice(0, 10);
        marketsByDay.set(day, (marketsByDay.get(day) || 0) + 1);
      });

      const betsByDay = new Map<string, number>();
      txnRows?.forEach((t) => {
        const day = t.created_at.slice(0, 10);
        betsByDay.set(day, (betsByDay.get(day) || 0) + 1);
      });

      setActivityData(
        last7.map((date) => ({
          date: new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" }),
          markets: marketsByDay.get(date) || 0,
          bets: betsByDay.get(date) || 0,
        }))
      );

      setLoading(false);
    };
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const cards = [
    { label: "Total Markets", value: stats?.totalMarkets ?? 0, icon: ShoppingBag, color: "text-primary" },
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-blue-500" },
    { label: "Total Volume", value: (stats?.totalVolume ?? 0) >= 1000 ? `$${((stats?.totalVolume ?? 0) / 1000).toFixed(1)}K` : `$${(stats?.totalVolume ?? 0).toFixed(2)}`, icon: TrendingUp, color: "text-green-500" },
    { label: "Transactions", value: stats?.totalTransactions ?? 0, icon: DollarSign, color: "text-yellow-500" },
    { label: "Comments", value: stats?.totalComments ?? 0, icon: MessageSquare, color: "text-purple-500" },
    { label: "Active Boosts", value: stats?.activeBoosts ?? 0, icon: Activity, color: "text-pink-500" },
    { label: "QT Rounds", value: stats?.quickTradeRounds ?? 0, icon: Zap, color: "text-cyan-500" },
    { label: "QT Volume", value: (stats?.quickTradeVolume ?? 0) >= 1000 ? `$${((stats?.quickTradeVolume ?? 0) / 1000).toFixed(1)}K` : `$${(stats?.quickTradeVolume ?? 0).toFixed(2)}`, icon: Zap, color: "text-amber-500" },
    { label: "Follows", value: stats?.totalFollows ?? 0, icon: UserCheck, color: "text-emerald-500" },
    { label: "Likes", value: stats?.totalLikes ?? 0, icon: Heart, color: "text-pink-500" },
    { label: "Referrals", value: stats?.totalReferrals ?? 0, icon: UserPlus, color: "text-cyan-500" },
    { label: "Rewards Paid", value: `$${(stats?.totalRewardsPaid ?? 0).toFixed(0)}`, icon: Gift, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">7-Day Activity</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="fillMarkets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillBets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="markets" stroke="hsl(var(--primary))" fill="url(#fillMarkets)" strokeWidth={2} />
                <Area type="monotone" dataKey="bets" stroke="hsl(var(--chart-2))" fill="url(#fillBets)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="text-[10px] text-muted-foreground">Markets Created</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} />
              <span className="text-[10px] text-muted-foreground">Bets Placed</span>
            </div>
          </div>
        </div>

        {/* Volume by category */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Volume by Category</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, "Volume"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="volume" radius={[0, 6, 6, 0]}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Second row: Market status pie + top markets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status pie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Market Status</h3>
          <div className="h-48 flex items-center justify-center">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 mt-1">
            {statusData.map((s, i) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-[10px] text-muted-foreground capitalize">{s.name} ({s.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top markets by volume */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Top Markets by Volume</h3>
          <div className="space-y-3">
            {categoryData.slice(0, 5).map((cat, i) => (
              <div key={cat.name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">{cat.volume >= 1000 ? `$${(cat.volume / 1000).toFixed(1)}K` : `$${cat.volume.toFixed(2)}`}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(cat.volume / (categoryData[0]?.volume || 1)) * 100}%`,
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {categoryData.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No market data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
