import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, DollarSign, TrendingUp, Users, PieChart as PieChartIcon } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
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

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))"];

const AdminCommissions = () => {
  const [loading, setLoading] = useState(true);
  const [totalAdmin, setTotalAdmin] = useState(0);
  const [totalCreator, setTotalCreator] = useState(0);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [topCreators, setTopCreators] = useState<{ name: string; earned: number }[]>([]);

  useEffect(() => {
    const fetch = async () => {
      // Get all commission transactions
      const { data: txns } = await supabase
        .from("transactions")
        .select("amount, created_at, user_id, market_id")
        .eq("type", "commission")
        .order("created_at", { ascending: true });

      if (!txns || txns.length === 0) {
        setLoading(false);
        return;
      }

      // Get admin user ids
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      const adminIds = new Set((adminRoles || []).map((r) => r.user_id));

      let adminTotal = 0;
      let creatorTotal = 0;
      const dayMap = new Map<string, { admin: number; creator: number }>();
      const creatorEarnings = new Map<string, number>();

      txns.forEach((t) => {
        const isAdmin = adminIds.has(t.user_id);
        if (isAdmin) {
          adminTotal += Number(t.amount);
        } else {
          creatorTotal += Number(t.amount);
          creatorEarnings.set(t.user_id, (creatorEarnings.get(t.user_id) || 0) + Number(t.amount));
        }

        const day = t.created_at.slice(0, 10);
        const existing = dayMap.get(day) || { admin: 0, creator: 0 };
        if (isAdmin) existing.admin += Number(t.amount);
        else existing.creator += Number(t.amount);
        dayMap.set(day, existing);
      });

      setTotalAdmin(adminTotal);
      setTotalCreator(creatorTotal);

      // Build daily data for last 30 days
      const last30 = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return d.toISOString().slice(0, 10);
      });

      let cumAdmin = 0;
      let cumCreator = 0;
      // Accumulate everything before the 30-day window
      dayMap.forEach((v, day) => {
        if (day < last30[0]) {
          cumAdmin += v.admin;
          cumCreator += v.creator;
        }
      });

      setDailyData(
        last30.map((date) => {
          const d = dayMap.get(date) || { admin: 0, creator: 0 };
          cumAdmin += d.admin;
          cumCreator += d.creator;
          return {
            date: new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" }),
            admin: Math.round(cumAdmin * 100) / 100,
            creator: Math.round(cumCreator * 100) / 100,
            total: Math.round((cumAdmin + cumCreator) * 100) / 100,
          };
        })
      );

      // Top creators
      if (creatorEarnings.size > 0) {
        const creatorIds = Array.from(creatorEarnings.keys());
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", creatorIds);

        const profileMap = new Map((profiles || []).map((p) => [p.id, p.display_name || p.email || p.id.slice(0, 8)]));

        setTopCreators(
          Array.from(creatorEarnings.entries())
            .map(([id, earned]) => ({ name: profileMap.get(id) || id.slice(0, 8), earned }))
            .sort((a, b) => b.earned - a.earned)
            .slice(0, 10)
        );
      }

      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const grandTotal = totalAdmin + totalCreator;
  const pieData = [
    { name: "Admin", value: totalAdmin },
    { name: "Creators", value: totalCreator },
  ].filter((d) => d.value > 0);

  const cards = [
    { label: "Total Commissions", value: `$${grandTotal.toFixed(2)}`, icon: DollarSign, color: "text-primary" },
    { label: "Admin Earned", value: `$${totalAdmin.toFixed(2)}`, icon: TrendingUp, color: "text-green-500" },
    { label: "Creators Earned", value: `$${totalCreator.toFixed(2)}`, icon: Users, color: "text-blue-500" },
    { label: "Top Creators", value: topCreators.length, icon: PieChartIcon, color: "text-yellow-500" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Commission Earnings</h2>

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
            <h3 className="text-sm font-semibold mb-4">Cumulative Earnings (30 Days)</h3>
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
                  <Area type="monotone" dataKey="admin" name="Admin" stroke="hsl(var(--primary))" fill="url(#fillAdmin)" strokeWidth={2} />
                  <Area type="monotone" dataKey="creator" name="Creators" stroke="hsl(var(--chart-2))" fill="url(#fillCreator)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <span className="text-[10px] text-muted-foreground">Admin</span>
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

            {/* Top creators bar */}
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
