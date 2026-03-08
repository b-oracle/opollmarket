import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BarChart3, Users, TrendingUp, MousePointerClick, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";

interface EventRow {
  event_name: string;
  user_id: string | null;
  created_at: string;
  properties: Record<string, any> | null;
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

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(7);
  const [polyFees, setPolyFees] = useState<{ adminFees: number; creatorFees: number; totalVolume: number; marketCount: number; feesByMarket: { title: string; adminFee: number; creatorFee: number }[] }>({
    adminFees: 0, creatorFees: 0, totalVolume: 0, marketCount: 0, feesByMarket: [],
  });

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - timeRange);
      const sinceISO = since.toISOString();

      // Fetch analytics events
      const eventsPromise = supabase
        .from("analytics_events")
        .select("event_name, user_id, created_at, properties")
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(1000);

      // Fetch Polymarket-linked markets
      const marketsPromise = supabase
        .from("markets")
        .select("id, title, polymarket_id")
        .not("polymarket_id", "is", null);

      const [eventsRes, marketsRes] = await Promise.all([eventsPromise, marketsPromise]);
      setEvents((eventsRes.data || []) as EventRow[]);

      const polyMarkets = marketsRes.data || [];
      if (polyMarkets.length > 0) {
        const polyMarketIds = polyMarkets.map((m) => m.id);
        const titleMap = new Map(polyMarkets.map((m) => [m.id, m.title]));

        // Fetch fee transactions for these markets
        const { data: feeTxns } = await supabase
          .from("transactions")
          .select("market_id, type, amount, created_at")
          .in("market_id", polyMarketIds)
          .in("type", ["admin_fee", "creator_fee", "buy"])
          .eq("status", "confirmed")
          .gte("created_at", sinceISO)
          .limit(1000);

        let adminTotal = 0;
        let creatorTotal = 0;
        let volume = 0;
        const marketFeeMap = new Map<string, { adminFee: number; creatorFee: number }>();

        for (const tx of feeTxns || []) {
          const mid = tx.market_id as string;
          if (!marketFeeMap.has(mid)) marketFeeMap.set(mid, { adminFee: 0, creatorFee: 0 });
          const entry = marketFeeMap.get(mid)!;

          if (tx.type === "admin_fee") {
            adminTotal += Number(tx.amount);
            entry.adminFee += Number(tx.amount);
          } else if (tx.type === "creator_fee") {
            creatorTotal += Number(tx.amount);
            entry.creatorFee += Number(tx.amount);
          } else if (tx.type === "buy") {
            volume += Number(tx.amount);
          }
        }

        const feesByMarket = Array.from(marketFeeMap.entries())
          .map(([mid, fees]) => ({
            title: titleMap.get(mid) || mid.slice(0, 8) + "…",
            adminFee: fees.adminFee,
            creatorFee: fees.creatorFee,
          }))
          .filter((m) => m.adminFee > 0 || m.creatorFee > 0)
          .sort((a, b) => (b.adminFee + b.creatorFee) - (a.adminFee + a.creatorFee))
          .slice(0, 8);

        setPolyFees({
          adminFees: adminTotal,
          creatorFees: creatorTotal,
          totalVolume: volume,
          marketCount: polyMarkets.length,
          feesByMarket,
        });
      } else {
        setPolyFees({ adminFees: 0, creatorFees: 0, totalVolume: 0, marketCount: 0, feesByMarket: [] });
      }

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

  // Compute stats
  const totalEvents = events.length;
  const uniqueUsers = new Set(events.filter((e) => e.user_id).map((e) => e.user_id)).size;
  const totalBets = events.filter((e) => e.event_name === "bet_confirmed").length;

  // Event counts by name
  const eventCountMap = new Map<string, number>();
  events.forEach((e) => {
    eventCountMap.set(e.event_name, (eventCountMap.get(e.event_name) || 0) + 1);
  });
  const eventCountData = Array.from(eventCountMap.entries())
    .map(([name, count]) => ({ name: name.replace(/_/g, " "), count }))
    .sort((a, b) => b.count - a.count);

  // Events over time
  const days = Array.from({ length: timeRange }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (timeRange - 1 - i));
    return d.toISOString().slice(0, 10);
  });

  const eventsByDay = new Map<string, number>();
  const usersByDay = new Map<string, Set<string>>();
  events.forEach((e) => {
    const day = e.created_at.slice(0, 10);
    eventsByDay.set(day, (eventsByDay.get(day) || 0) + 1);
    if (e.user_id) {
      if (!usersByDay.has(day)) usersByDay.set(day, new Set());
      usersByDay.get(day)!.add(e.user_id);
    }
  });

  const timelineData = days.map((date) => ({
    date: new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" }),
    events: eventsByDay.get(date) || 0,
    users: usersByDay.get(date)?.size || 0,
  }));

  // Popular markets from bet events
  const marketBets = new Map<string, number>();
  events
    .filter((e) => e.event_name === "bet_placed" || e.event_name === "bet_confirmed")
    .forEach((e) => {
      const mid = (e.properties as any)?.marketId;
      if (mid) marketBets.set(mid, (marketBets.get(mid) || 0) + 1);
    });
  const popularMarkets = Array.from(marketBets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const statCards = [
    { label: "Total Events", value: totalEvents, icon: MousePointerClick, color: "text-primary" },
    { label: "Active Users", value: uniqueUsers, icon: Users, color: "text-blue-500" },
    { label: "Bets Confirmed", value: totalBets, icon: TrendingUp, color: "text-green-500" },
    { label: "Unique Events", value: eventCountMap.size, icon: BarChart3, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {([7, 14, 30] as const).map((d) => (
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
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>

      {/* Timeline chart */}
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
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="events" stroke="hsl(var(--primary))" fill="url(#fillEvents)" strokeWidth={2} />
                <Area type="monotone" dataKey="users" stroke="hsl(var(--chart-2))" fill="url(#fillUsers)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="text-[10px] text-muted-foreground">Events</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} />
              <span className="text-[10px] text-muted-foreground">Active Users</span>
            </div>
          </div>
        </div>

        {/* Event breakdown */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Event Breakdown</h3>
          {eventCountData.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventCountData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {eventCountData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">No events recorded yet</p>
          )}
        </div>
      </div>

      {/* Popular markets */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4">Most Active Markets (by bets)</h3>
        {popularMarkets.length > 0 ? (
          <div className="space-y-3">
            {popularMarkets.map(([marketId, count], i) => (
              <div key={marketId} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate font-mono">{marketId.slice(0, 8)}…</span>
                    <span className="text-xs text-muted-foreground">{count} bets</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / (popularMarkets[0]?.[1] || 1)) * 100}%`,
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No bet events recorded yet</p>
        )}
      </div>

      {/* Polymarket Fee Earnings */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <span>🔮</span> Polymarket Fee Earnings
        </h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Admin Fees", value: `$${polyFees.adminFees.toFixed(2)}`, color: "text-green-500", icon: DollarSign },
            { label: "Creator Fees", value: `$${polyFees.creatorFees.toFixed(2)}`, color: "text-blue-500", icon: DollarSign },
            { label: "Total Fees", value: `$${(polyFees.adminFees + polyFees.creatorFees).toFixed(2)}`, color: "text-primary", icon: TrendingUp },
            { label: "Poly Volume", value: `$${polyFees.totalVolume.toFixed(2)}`, color: "text-purple-500", icon: BarChart3 },
          ].map((card) => (
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
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="title" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={120} tickFormatter={(v) => v.length > 20 ? v.slice(0, 20) + "…" : v} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name === "adminFee" ? "Admin Fee" : "Creator Fee"]}
                  />
                  <Bar dataKey="adminFee" stackId="fees" fill="hsl(var(--chart-3))" radius={[0, 0, 0, 0]} name="Admin Fee" />
                  <Bar dataKey="creatorFee" stackId="fees" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} name="Creator Fee" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-3))" }} />
                <span className="text-[10px] text-muted-foreground">Admin Fee</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} />
                <span className="text-[10px] text-muted-foreground">Creator Fee</span>
              </div>
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
