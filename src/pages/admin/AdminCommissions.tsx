import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, DollarSign, TrendingUp, Users, PieChart as PieChartIcon } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

interface CommissionTxn {
  amount: number;
  created_at: string;
  user_id: string;
  market_id: string | null;
}

interface DailyData {
  date: string;
  admin: number;
  creator: number;
  total: number;
}

type RangeKey = "7d" | "30d" | "90d" | "all";
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "all", label: "All Time", days: null },
];

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))"];

const AdminCommissions = () => {
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("30d");
  const [allTxns, setAllTxns] = useState<CommissionTxn[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [profileMap, setProfileMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const fetchData = async () => {
      const fetchAllTxns = async () => {
        let fetchedTxns: any[] = [];
        let page = 0;
        let hasMore = true;
        while (hasMore) {
          const { data } = await supabase
            .from("transactions")
            .select("amount, created_at, user_id, market_id")
            .eq("type", "commission")
            .eq("status", "confirmed")
            .order("created_at", { ascending: true })
            .range(page * 1000, (page + 1) * 1000 - 1);
            
          if (data && data.length > 0) {
            fetchedTxns = [...fetchedTxns, ...data];
            page++;
            if (data.length < 1000) hasMore = false;
          } else {
            hasMore = false;
          }
        }
        return fetchedTxns;
      };

      const [txns, { data: adminRoles }] = await Promise.all([
        fetchAllTxns(),
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin"),
      ]);

      const ids = new Set((adminRoles || []).map((r) => r.user_id));
      setAdminIds(ids);
      setAllTxns(txns || []);

      // Fetch creator profiles
      const creatorUserIds = [...new Set((txns || []).filter(t => !ids.has(t.user_id)).map(t => t.user_id))];
      if (creatorUserIds.length > 0) {
        const { data: profiles } = await supabase.rpc("admin_get_user_emails", {
          _user_ids: creatorUserIds,
        });
        setProfileMap(new Map(((profiles as any[]) || []).map((p: any) => [p.id, p.display_name || p.email || p.id.slice(0, 8)])));
      }

      setLoading(false);
    };
    fetchData();
  }, []);

  const { totalAdmin, totalCreator, dailyData, topCreators } = useMemo(() => {
    const selectedRange = RANGES.find(r => r.key === range)!;
    const days = selectedRange.days;

    // Filter txns by date range
    let cutoff = "";
    if (days) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      cutoff = d.toISOString().slice(0, 10);
    }

    const filtered = days
      ? allTxns.filter(t => t.created_at.slice(0, 10) >= cutoff)
      : allTxns;

    let adminTotal = 0;
    let creatorTotal = 0;
    const dayMap = new Map<string, { admin: number; creator: number }>();
    const creatorEarnings = new Map<string, number>();

    filtered.forEach((t) => {
      const isAdmin = adminIds.has(t.user_id);
      const amt = Number(t.amount);
      if (isAdmin) {
        adminTotal += amt;
      } else {
        creatorTotal += amt;
        creatorEarnings.set(t.user_id, (creatorEarnings.get(t.user_id) || 0) + amt);
      }
      const day = t.created_at.slice(0, 10);
      const existing = dayMap.get(day) || { admin: 0, creator: 0 };
      if (isAdmin) existing.admin += amt;
      else existing.creator += amt;
      dayMap.set(day, existing);
    });

    // Build chart data
    const numDays = days || (allTxns.length > 0
      ? Math.max(7, Math.ceil((Date.now() - new Date(allTxns[0].created_at).getTime()) / 86400000) + 1)
      : 30);

    const dateRange = Array.from({ length: numDays }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (numDays - 1 - i));
      return d.toISOString().slice(0, 10);
    });

    let cumAdmin = 0;
    let cumCreator = 0;

    // For ranged views, accumulate pre-window data from filtered set? No — we want cumulative within the window.
    // Actually for cumulative chart, start from 0 within the window.
    const chartData = dateRange.map((date) => {
      const d = dayMap.get(date) || { admin: 0, creator: 0 };
      cumAdmin += d.admin;
      cumCreator += d.creator;
      return {
        date: new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" }),
        admin: Math.round(cumAdmin * 100) / 100,
        creator: Math.round(cumCreator * 100) / 100,
        total: Math.round((cumAdmin + cumCreator) * 100) / 100,
      };
    });

    const creators = Array.from(creatorEarnings.entries())
      .map(([id, earned]) => ({ name: profileMap.get(id) || id.slice(0, 8), earned }))
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 10);

    return { totalAdmin: adminTotal, totalCreator: creatorTotal, dailyData: chartData, topCreators: creators };
  }, [allTxns, adminIds, profileMap, range]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const grandTotal = totalAdmin + totalCreator;
  const pieData = [
    { name: "System-Mod", value: totalAdmin },
    { name: "Creators", value: totalCreator },
  ].filter((d) => d.value > 0);

  const selectedLabel = RANGES.find(r => r.key === range)!.label;

  const cards = [
    { label: "Total Commissions", value: `$${grandTotal.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { label: "System-Mod Earned", value: `$${totalAdmin.toFixed(2)}`, icon: TrendingUp, color: "text-primary" },
    { label: "Creators Earned", value: `$${totalCreator.toFixed(2)}`, icon: Users, color: "text-primary" },
    { label: "Top Creators", value: topCreators.length, icon: PieChartIcon, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Commission Earnings</h2>
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                range === r.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      {grandTotal === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <p className="text-muted-foreground">No commission data yet. Commissions will appear here after users place predictions.</p>
        </div>
      ) : (
        <>
          {/* Cumulative earnings chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4">Cumulative Earnings ({selectedLabel})</h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="fillAdmin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillCreator" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area type="monotone" dataKey="admin" name="System-Mod" stroke="hsl(var(--primary))" fill="url(#fillAdmin)" strokeWidth={2} />
                  <Area type="monotone" dataKey="creator" name="Creators" stroke="hsl(var(--chart-2))" fill="url(#fillCreator)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <span className="text-[10px] text-muted-foreground">System-Mod</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} />
                <span className="text-[10px] text-muted-foreground">Creators</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Split pie */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Earnings Split</h3>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`$${value.toFixed(2)}`]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 mt-1">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground">{d.name} (${d.value.toFixed(2)})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top creators */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4">Top Earning Creators</h3>
              {topCreators.length > 0 ? (
                <div className="space-y-3">
                  {topCreators.slice(0, 5).map((c, i) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium truncate">{c.name}</span>
                          <span className="text-xs text-muted-foreground">${c.earned.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(c.earned / (topCreators[0]?.earned || 1)) * 100}%`,
                              backgroundColor: "hsl(var(--chart-2))",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No creator earnings yet</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminCommissions;
