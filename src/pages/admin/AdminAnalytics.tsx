import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BarChart3, Users, TrendingUp, MousePointerClick, DollarSign, Zap, Target, ArrowUpDown, Percent, Shield } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, PieChart, Pie } from "recharts";

interface EventRow {
  event_name: string;
  user_id: string | null;
  created_at: string;
  properties: Record<string, any> | null;
}

interface QtStats {
  totalBets: number;
  totalWagered: number;
  totalPayouts: number;
  wins: number;
  losses: number;
  winRate: number;
  dailyData: { date: string; wins: number; losses: number; volume: number }[];
  assetBreakdown: { asset: string; count: number; volume: number }[];
}

interface RevenueStats {
  deposits: number;
  withdrawals: number;
  predictionVolume: number;
  netRevenue: number;
  dailyData: { date: string; deposits: number; withdrawals: number }[];
}

interface OsureStats {
  totalPremiums: number;
  totalClaims: number;
  totalForfeited: number;
  pendingCount: number;
  claimedCount: number;
  forfeitedCount: number;
  forfeitureRate: number;
  dailyData: { date: string; premiums: number; claims: number }[];
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

const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(2)}`;

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(7);
  const [popularMarkets, setPopularMarkets] = useState<{ id: string; title: string; count: number }[]>([]);
  const [qtStats, setQtStats] = useState<QtStats>({ totalBets: 0, totalWagered: 0, totalPayouts: 0, wins: 0, losses: 0, winRate: 0, dailyData: [], assetBreakdown: [] });
  const [revenueStats, setRevenueStats] = useState<RevenueStats>({ deposits: 0, withdrawals: 0, predictionVolume: 0, netRevenue: 0, dailyData: [] });
  const [allTimePredictionVolume, setAllTimePredictionVolume] = useState(0);
  const [polyFees, setPolyFees] = useState<{ adminFees: number; creatorFees: number; totalVolume: number; marketCount: number; feesByMarket: { title: string; adminFee: number; creatorFee: number }[] }>({
    adminFees: 0, creatorFees: 0, totalVolume: 0, marketCount: 0, feesByMarket: [],
  });
  const [osureStats, setOsureStats] = useState<OsureStats>({ totalPremiums: 0, totalClaims: 0, totalForfeited: 0, pendingCount: 0, claimedCount: 0, forfeitedCount: 0, forfeitureRate: 0, dailyData: [] });

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - timeRange);
      const sinceISO = since.toISOString();

      const days = Array.from({ length: timeRange }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (timeRange - 1 - i));
        return d.toISOString().slice(0, 10);
      });

      // Paginated fetch helper
      const fetchPaginated = async (buildQuery: (page: number) => any): Promise<any[]> => {
        let all: any[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          const { data } = await buildQuery(page);
          if (data && data.length > 0) {
            all = [...all, ...data];
            page++;
            if (data.length < 1000) hasMore = false;
          } else {
            hasMore = false;
          }
        }
        return all;
      };

      // Fetch all-time prediction volume from transactions (buys + sells)
      const fetchAllTimeVolume = async () => {
        let total = 0;
        for (const txType of ["buy", "sell"]) {
          let from = 0;
          const batchSize = 1000;
          while (true) {
            const { data, error } = await supabase.from("transactions").select("amount").eq("type", txType).eq("status", "confirmed").range(from, from + batchSize - 1);
            if (error || !data || data.length === 0) break;
            total += data.reduce((s, r) => s + Number(r.amount), 0);
            if (data.length < batchSize) break;
            from += batchSize;
          }
        }
        return total;
      };

      // Parallel fetches
      const [eventsData, quickBetsData, txData, polyMarkets, { data: adminRoles }, allTimeVol] = await Promise.all([
        fetchPaginated((p) =>
          supabase.from("analytics_events").select("event_name, user_id, created_at, properties").gte("created_at", sinceISO).order("created_at", { ascending: false }).range(p * 1000, (p + 1) * 1000 - 1)
        ),
        fetchPaginated((p) =>
          supabase.from("quick_bets").select("id, user_id, amount, payout, status, side, created_at, round_id").gte("created_at", sinceISO).in("status", ["won", "lost"]).range(p * 1000, (p + 1) * 1000 - 1)
        ),
        fetchPaginated((p) =>
          supabase.from("transactions").select("id, user_id, type, amount, status, market_id, created_at").gte("created_at", sinceISO).eq("status", "confirmed").in("type", ["deposit", "withdrawal", "buy", "payout", "commission"]).range(p * 1000, (p + 1) * 1000 - 1)
        ),
        supabase.from("markets").select("id, title, polymarket_id").not("polymarket_id", "is", null).then(r => r.data || []),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
        fetchAllTimeVolume(),
      ]);
      setAllTimePredictionVolume(allTimeVol);

      setEvents(eventsData);
      const adminIds = new Set((adminRoles || []).map((r: any) => r.user_id));

      // --- Quick Trade Stats ---
      const qtWins = quickBetsData.filter((b: any) => b.status === "won");
      const qtLosses = quickBetsData.filter((b: any) => b.status === "lost");
      const totalWagered = quickBetsData.reduce((s: number, b: any) => s + Number(b.amount), 0);
      const totalPayouts = qtWins.reduce((s: number, b: any) => s + Number(b.payout || 0), 0);
      const winRate = quickBetsData.length > 0 ? (qtWins.length / quickBetsData.length) * 100 : 0;

      // QT daily
      const qtDailyMap = new Map<string, { wins: number; losses: number; volume: number }>();
      days.forEach(d => qtDailyMap.set(d, { wins: 0, losses: 0, volume: 0 }));
      quickBetsData.forEach((b: any) => {
        const day = b.created_at.slice(0, 10);
        const entry = qtDailyMap.get(day);
        if (entry) {
          entry.volume += Number(b.amount);
          if (b.status === "won") entry.wins++;
          else entry.losses++;
        }
      });

      // QT asset breakdown - fetch round assets
      const roundIds = [...new Set(quickBetsData.map((b: any) => b.round_id))];
      let assetMap = new Map<string, string>();
      if (roundIds.length > 0) {
        // Batch fetch rounds
        const batchSize = 100;
        for (let i = 0; i < roundIds.length; i += batchSize) {
          const batch = roundIds.slice(i, i + batchSize);
          const { data: rounds } = await supabase.from("quick_rounds").select("id, asset").in("id", batch);
          if (rounds) rounds.forEach((r: any) => assetMap.set(r.id, r.asset));
        }
      }
      const assetAgg = new Map<string, { count: number; volume: number }>();
      quickBetsData.forEach((b: any) => {
        const asset = assetMap.get(b.round_id) || "Unknown";
        const entry = assetAgg.get(asset) || { count: 0, volume: 0 };
        entry.count++;
        entry.volume += Number(b.amount);
        assetAgg.set(asset, entry);
      });

      setQtStats({
        totalBets: quickBetsData.length,
        totalWagered,
        totalPayouts,
        wins: qtWins.length,
        losses: qtLosses.length,
        winRate,
        dailyData: days.map(d => ({ date: new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" }), ...(qtDailyMap.get(d) || { wins: 0, losses: 0, volume: 0 }) })),
        assetBreakdown: Array.from(assetAgg.entries()).map(([asset, v]) => ({ asset, ...v })).sort((a, b) => b.volume - a.volume),
      });

      // --- Revenue Stats ---
      const deposits = txData.filter((t: any) => t.type === "deposit").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const withdrawals = txData.filter((t: any) => t.type === "withdrawal").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const predictionVolume = txData.filter((t: any) => (t.type === "buy" || t.type === "sell") && t.market_id).reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalPlatformPayouts = txData.filter((t: any) => t.type === "payout").reduce((s: number, t: any) => s + Number(t.amount), 0);

      const revDailyMap = new Map<string, { deposits: number; withdrawals: number }>();
      days.forEach(d => revDailyMap.set(d, { deposits: 0, withdrawals: 0 }));
      txData.forEach((t: any) => {
        if (t.type !== "deposit" && t.type !== "withdrawal") return;
        const day = t.created_at.slice(0, 10);
        const entry = revDailyMap.get(day);
        if (entry) {
          if (t.type === "deposit") entry.deposits += Number(t.amount);
          else entry.withdrawals += Number(t.amount);
        }
      });

      setRevenueStats({
        deposits,
        withdrawals,
        predictionVolume,
        netRevenue: deposits - withdrawals - totalPlatformPayouts,
        dailyData: days.map(d => ({ date: new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" }), ...(revDailyMap.get(d) || { deposits: 0, withdrawals: 0 }) })),
      });

      // --- Popular Markets ---
      const marketBets = new Map<string, number>();
      eventsData
        .filter(e => e.event_name === "bet_placed" || e.event_name === "bet_confirmed")
        .forEach(e => {
          const mid = (e.properties as any)?.marketId;
          if (mid) marketBets.set(mid, (marketBets.get(mid) || 0) + 1);
        });
      const popularMarketIdsCount = Array.from(marketBets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const popularIds = popularMarketIdsCount.map(e => e[0]);
      let popularTitles = new Map<string, string>();
      if (popularIds.length > 0) {
        const { data: titleData } = await supabase.from("markets").select("id, title").in("id", popularIds);
        if (titleData) titleData.forEach(d => popularTitles.set(d.id, d.title));
      }
      setPopularMarkets(popularMarketIdsCount.map(([id, count]) => ({ id, title: popularTitles.get(id) || id.slice(0, 8) + "…", count })));

      // --- Polymarket Fees ---
      if (polyMarkets.length > 0) {
        const polyMarketIds = polyMarkets.map((m: any) => m.id);
        const titleMap = new Map(polyMarkets.map((m: any) => [m.id, m.title]));
        const feeTxns = await fetchPaginated((p) =>
          supabase.from("transactions").select("market_id, type, amount, created_at, user_id").in("market_id", polyMarketIds).in("type", ["commission", "buy"]).eq("status", "confirmed").gte("created_at", sinceISO).range(p * 1000, (p + 1) * 1000 - 1)
        );

        let adminTotal = 0, creatorTotal = 0, volume = 0;
        const marketFeeMap = new Map<string, { adminFee: number; creatorFee: number }>();
        for (const tx of feeTxns) {
          const mid = tx.market_id as string;
          if (!marketFeeMap.has(mid)) marketFeeMap.set(mid, { adminFee: 0, creatorFee: 0 });
          const entry = marketFeeMap.get(mid)!;
          if (tx.type === "commission") {
            if (adminIds.has(tx.user_id)) { adminTotal += Number(tx.amount); entry.adminFee += Number(tx.amount); }
            else { creatorTotal += Number(tx.amount); entry.creatorFee += Number(tx.amount); }
          } else if (tx.type === "buy") { volume += Number(tx.amount); }
        }
        setPolyFees({
          adminFees: adminTotal, creatorFees: creatorTotal, totalVolume: volume, marketCount: polyMarkets.length,
          feesByMarket: Array.from(marketFeeMap.entries())
            .map(([mid, fees]) => ({ title: titleMap.get(mid) || mid.slice(0, 8) + "…", adminFee: fees.adminFee, creatorFee: fees.creatorFee }))
            .filter(m => m.adminFee > 0 || m.creatorFee > 0)
            .sort((a, b) => (b.adminFee + b.creatorFee) - (a.adminFee + a.creatorFee)).slice(0, 8),
        });
      } else {
        setPolyFees({ adminFees: 0, creatorFees: 0, totalVolume: 0, marketCount: 0, feesByMarket: [] });
      }

      // --- oSURE Insurance Analytics ---
      const osureData = await fetchPaginated((p) =>
        supabase.from("insurance_claims").select("id, user_id, tier, premium_paid, claim_amount, status, created_at").gte("created_at", sinceISO).range(p * 1000, (p + 1) * 1000 - 1)
      );

      const totalPremiums = osureData.reduce((s: number, c: any) => s + Number(c.premium_paid || 0), 0);
      const claimedRows = osureData.filter((c: any) => c.status === "claimed");
      const forfeitedRows = osureData.filter((c: any) => c.status === "forfeited");
      const pendingRows = osureData.filter((c: any) => c.status === "pending");
      const totalClaims = claimedRows.reduce((s: number, c: any) => s + Number(c.claim_amount || 0), 0);
      const totalForfeited = forfeitedRows.reduce((s: number, c: any) => s + Number(c.premium_paid || 0), 0);
      const resolvedCount = claimedRows.length + forfeitedRows.length;
      const forfeitureRate = resolvedCount > 0 ? (forfeitedRows.length / resolvedCount) * 100 : 0;

      const osureDailyMap = new Map<string, { premiums: number; claims: number }>();
      days.forEach(d => osureDailyMap.set(d, { premiums: 0, claims: 0 }));
      osureData.forEach((c: any) => {
        const day = c.created_at.slice(0, 10);
        const entry = osureDailyMap.get(day);
        if (entry) {
          entry.premiums += Number(c.premium_paid || 0);
          if (c.status === "claimed") entry.claims += Number(c.claim_amount || 0);
        }
      });

      setOsureStats({
        totalPremiums,
        totalClaims,
        totalForfeited,
        pendingCount: pendingRows.length,
        claimedCount: claimedRows.length,
        forfeitedCount: forfeitedRows.length,
        forfeitureRate,
        dailyData: days.map(d => ({ date: new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" }), ...(osureDailyMap.get(d) || { premiums: 0, claims: 0 }) })),
      });

      setLoading(false);
    };
    fetchAll();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  // Compute event stats
  const totalEvents = events.length;
  const uniqueUsers = new Set(events.filter(e => e.user_id).map(e => e.user_id)).size;
  const totalPredictions = events.filter(e => e.event_name === "bet_confirmed").length;
  const totalTrades = totalPredictions + qtStats.totalBets;

  const eventCountMap = new Map<string, number>();
  events.forEach(e => eventCountMap.set(e.event_name, (eventCountMap.get(e.event_name) || 0) + 1));
  const eventCountData = Array.from(eventCountMap.entries()).map(([name, count]) => ({ name: name.replace(/_/g, " "), count })).sort((a, b) => b.count - a.count);

  // Timeline
  const days = Array.from({ length: timeRange }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (timeRange - 1 - i));
    return d.toISOString().slice(0, 10);
  });
  const eventsByDay = new Map<string, number>();
  const usersByDay = new Map<string, Set<string>>();
  events.forEach(e => {
    const day = e.created_at.slice(0, 10);
    eventsByDay.set(day, (eventsByDay.get(day) || 0) + 1);
    if (e.user_id) {
      if (!usersByDay.has(day)) usersByDay.set(day, new Set());
      usersByDay.get(day)!.add(e.user_id);
    }
  });
  const timelineData = days.map(date => ({
    date: new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" }),
    events: eventsByDay.get(date) || 0,
    users: usersByDay.get(date)?.size || 0,
  }));

  const statCards = [
    { label: "Total Events", value: totalEvents.toLocaleString(), icon: MousePointerClick, color: "text-primary" },
    { label: "Active Users", value: uniqueUsers.toLocaleString(), icon: Users, color: "text-blue-500" },
    { label: "Total Trades", value: totalTrades.toLocaleString(), icon: TrendingUp, color: "text-green-500" },
    { label: "Predictions", value: totalPredictions.toLocaleString(), icon: Target, color: "text-purple-500" },
    { label: "Quick Trades", value: qtStats.totalBets.toLocaleString(), icon: Zap, color: "text-amber-500" },
    { label: "QT Win Rate", value: `${qtStats.winRate.toFixed(1)}%`, icon: Percent, color: "text-emerald-500" },
    { label: `Prediction Vol (${timeRange}d)`, value: fmt(revenueStats.predictionVolume), icon: DollarSign, color: "text-cyan-500" },
    { label: "QT Volume", value: fmt(qtStats.totalWagered), icon: BarChart3, color: "text-orange-500" },
  ];

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {([7, 14, 30] as const).map(d => (
            <button
              key={d}
              onClick={() => setTimeRange(d)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                timeRange === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>

      {/* Timeline + Event Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Events Over Time</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="fillEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="events" stroke="hsl(var(--primary))" fill="url(#fillEvents)" strokeWidth={2} />
                <Area type="monotone" dataKey="users" stroke="hsl(var(--chart-2))" fill="url(#fillUsers)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-primary" /><span className="text-[10px] text-muted-foreground">Events</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} /><span className="text-[10px] text-muted-foreground">Active Users</span></div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Event Breakdown</h3>
          {eventCountData.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventCountData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {eventCountData.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">No events recorded yet</p>
          )}
        </div>
      </div>

      {/* Quick Trade Section */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> Quick Trade Analytics</h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "QT Volume", value: fmt(qtStats.totalWagered), color: "text-amber-500", icon: DollarSign },
            { label: "QT Payouts", value: fmt(qtStats.totalPayouts), color: "text-green-500", icon: TrendingUp },
            { label: "Platform Edge", value: fmt(qtStats.totalWagered - qtStats.totalPayouts), color: "text-primary", icon: BarChart3 },
            { label: "Win Rate", value: `${qtStats.winRate.toFixed(1)}%`, color: "text-emerald-500", icon: Percent },
          ].map(card => (
            <div key={card.label} className="bg-muted/30 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
                <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
              </div>
              <span className="text-lg font-bold">{card.value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* QT Daily Activity */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Daily Activity</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={qtStats.dailyData}>
                  <defs>
                    <linearGradient id="fillWins" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillLosses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="wins" stroke="hsl(var(--chart-3))" fill="url(#fillWins)" strokeWidth={2} name="Wins" />
                  <Area type="monotone" dataKey="losses" stroke="hsl(var(--chart-5))" fill="url(#fillLosses)" strokeWidth={2} name="Losses" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-3))" }} /><span className="text-[10px] text-muted-foreground">Wins</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-5))" }} /><span className="text-[10px] text-muted-foreground">Losses</span></div>
            </div>
          </div>

          {/* QT Asset Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Asset Breakdown</h4>
            {qtStats.assetBreakdown.length > 0 ? (
              <div className="space-y-2.5">
                {qtStats.assetBreakdown.slice(0, 6).map((a, i) => (
                  <div key={a.asset} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-10">{a.asset}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{a.count} trades</span>
                        <span className="text-xs font-medium">{fmt(a.volume)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(a.volume / (qtStats.assetBreakdown[0]?.volume || 1)) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No quick trade data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Revenue Overview */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><ArrowUpDown className="w-4 h-4 text-primary" /> Revenue Overview</h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Deposits", value: fmt(revenueStats.deposits), color: "text-green-500", icon: TrendingUp },
            { label: "Withdrawals", value: fmt(revenueStats.withdrawals), color: "text-red-500", icon: DollarSign },
            { label: "Prediction Vol", value: fmt(revenueStats.predictionVolume), color: "text-blue-500", icon: Target },
            { label: "Net Revenue", value: fmt(revenueStats.netRevenue), color: revenueStats.netRevenue >= 0 ? "text-green-500" : "text-red-500", icon: BarChart3 },
          ].map(card => (
            <div key={card.label} className="bg-muted/30 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
                <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
              </div>
              <span className="text-lg font-bold">{card.value}</span>
            </div>
          ))}
        </div>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueStats.dailyData}>
              <defs>
                <linearGradient id="fillDeposits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fillWithdrawals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`$${value.toFixed(2)}`]} />
              <Area type="monotone" dataKey="deposits" stroke="hsl(var(--chart-3))" fill="url(#fillDeposits)" strokeWidth={2} name="Deposits" />
              <Area type="monotone" dataKey="withdrawals" stroke="hsl(var(--chart-5))" fill="url(#fillWithdrawals)" strokeWidth={2} name="Withdrawals" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-3))" }} /><span className="text-[10px] text-muted-foreground">Deposits</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-5))" }} /><span className="text-[10px] text-muted-foreground">Withdrawals</span></div>
        </div>
      </div>

      {/* Popular markets */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Most Active Markets (by predictions)</h3>
        {popularMarkets.length > 0 ? (
          <div className="space-y-3">
            {popularMarkets.map((market, i) => (
              <div key={market.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate" title={market.title}>{market.title}</span>
                    <span className="text-xs text-muted-foreground">{market.count} predictions</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(market.count / (popularMarkets[0]?.count || 1)) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No prediction events recorded yet</p>
        )}
      </div>

      {/* oSURE Insurance Analytics */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500" /> oSURE Insurance Analytics</h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Premiums Collected", value: fmt(osureStats.totalPremiums), color: "text-emerald-500", icon: DollarSign },
            { label: "Claims Paid", value: fmt(osureStats.totalClaims), color: "text-red-500", icon: Shield },
            { label: "Net Profit", value: fmt(osureStats.totalPremiums - osureStats.totalClaims), color: osureStats.totalPremiums - osureStats.totalClaims >= 0 ? "text-green-500" : "text-red-500", icon: TrendingUp },
            { label: "Forfeiture Rate", value: `${osureStats.forfeitureRate.toFixed(1)}%`, color: "text-amber-500", icon: Percent },
          ].map(card => (
            <div key={card.label} className="bg-muted/30 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
                <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
              </div>
              <span className="text-lg font-bold">{card.value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Daily premiums vs claims */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Daily Premiums vs Claims</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={osureStats.dailyData}>
                  <defs>
                    <linearGradient id="fillPremiums" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillClaims" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`$${value.toFixed(2)}`]} />
                  <Area type="monotone" dataKey="premiums" stroke="hsl(var(--chart-3))" fill="url(#fillPremiums)" strokeWidth={2} name="Premiums" />
                  <Area type="monotone" dataKey="claims" stroke="hsl(var(--chart-5))" fill="url(#fillClaims)" strokeWidth={2} name="Claims" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-3))" }} /><span className="text-[10px] text-muted-foreground">Premiums</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-5))" }} /><span className="text-[10px] text-muted-foreground">Claims</span></div>
            </div>
          </div>

          {/* Status breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Claim Status Breakdown</h4>
            {(osureStats.pendingCount + osureStats.claimedCount + osureStats.forfeitedCount) > 0 ? (
              <div className="flex items-center justify-center h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Pending", value: osureStats.pendingCount, fill: "hsl(var(--chart-4))" },
                        { name: "Claimed", value: osureStats.claimedCount, fill: "hsl(var(--chart-5))" },
                        { name: "Forfeited", value: osureStats.forfeitedCount, fill: "hsl(var(--chart-3))" },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {[
                        { fill: "hsl(var(--chart-4))" },
                        { fill: "hsl(var(--chart-5))" },
                        { fill: "hsl(var(--chart-3))" },
                      ].map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No insurance claims yet</p>
            )}
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-4))" }} /><span className="text-[10px] text-muted-foreground">Pending ({osureStats.pendingCount})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-5))" }} /><span className="text-[10px] text-muted-foreground">Claimed ({osureStats.claimedCount})</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-3))" }} /><span className="text-[10px] text-muted-foreground">Forfeited ({osureStats.forfeitedCount})</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Polymarket Fee Earnings */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><span>🔮</span> Polymarket Fee Earnings</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Admin Fees", value: fmt(polyFees.adminFees), color: "text-green-500", icon: DollarSign },
            { label: "Creator Fees", value: fmt(polyFees.creatorFees), color: "text-blue-500", icon: DollarSign },
            { label: "Total Fees", value: fmt(polyFees.adminFees + polyFees.creatorFees), color: "text-primary", icon: TrendingUp },
            { label: "Poly Volume", value: fmt(polyFees.totalVolume), color: "text-purple-500", icon: BarChart3 },
          ].map(card => (
            <div key={card.label} className="bg-muted/30 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
                <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
              </div>
              <span className="text-lg font-bold">{card.value}</span>
            </div>
          ))}
        </div>
        {polyFees.feesByMarket.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Fee Breakdown by Market</h4>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={polyFees.feesByMarket} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <YAxis type="category" dataKey="title" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={120} tickFormatter={v => v.length > 20 ? v.slice(0, 20) + "…" : v} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === "adminFee" ? "Admin Fee" : "Creator Fee"]} />
                  <Bar dataKey="adminFee" stackId="fees" fill="hsl(var(--chart-3))" radius={[0, 0, 0, 0]} name="Admin Fee" />
                  <Bar dataKey="creatorFee" stackId="fees" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} name="Creator Fee" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-3))" }} /><span className="text-[10px] text-muted-foreground">Admin Fee</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} /><span className="text-[10px] text-muted-foreground">Creator Fee</span></div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No Polymarket fee data for this period</p>
        )}
      </div>
    </div>
  );
};

export default AdminAnalytics;
