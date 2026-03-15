import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, DollarSign, Users, Gift, Copy, Clock, Sparkles, PieChart as PieChartIcon, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";

type TabKey = "all" | "creator" | "referral" | "copy_trade" | "signup_bonus" | "pending";

const tabs: { key: TabKey; label: string; icon: typeof DollarSign }[] = [
  { key: "all", label: "All", icon: DollarSign },
  { key: "creator", label: "Creator", icon: Sparkles },
  { key: "referral", label: "Referral", icon: Users },
  { key: "copy_trade", label: "Copy Trade", icon: Copy },
  { key: "signup_bonus", label: "Signup Bonus", icon: Gift },
  { key: "pending", label: "Pending", icon: Clock },
];

const formatAmount = (n: number) => `$${n.toFixed(2)}`;
const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const Commissions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Fetch pending_commissions (creator + referral, released + pending)
  const { data: pendingCommissions, isLoading: loadingPC } = useQuery({
    queryKey: ["commissions-breakdown", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pending_commissions")
        .select("id, amount, type, status, created_at, releases_at, market_id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch copy_trade_earnings
  const { data: copyEarnings, isLoading: loadingCT } = useQuery({
    queryKey: ["copy-trade-earnings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("copy_trade_earnings")
        .select("id, commission_amount, trade_type, created_at, market_id")
        .eq("trader_user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  // Fetch referral_rewards (signup bonus)
  const { data: signupBonuses, isLoading: loadingSB } = useQuery({
    queryKey: ["referral-rewards-breakdown", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("referral_rewards")
        .select("id, amount, created_at, referred_id")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const isLoading = loadingPC || loadingCT || loadingSB;

  // Compute totals
  const totals = useMemo(() => {
    const creator = (pendingCommissions ?? [])
      .filter((c) => c.type === "creator" && c.status === "released")
      .reduce((s, c) => s + Number(c.amount), 0);
    const referral = (pendingCommissions ?? [])
      .filter((c) => c.type === "referral" && c.status === "released")
      .reduce((s, c) => s + Number(c.amount), 0);
    const copyTrade = (copyEarnings ?? []).reduce((s, c) => s + Number(c.commission_amount), 0);
    const signup = (signupBonuses ?? []).reduce((s, c) => s + Number(c.amount), 0);
    const pending = (pendingCommissions ?? [])
      .filter((c) => c.status === "pending")
      .reduce((s, c) => s + Number(c.amount), 0);
    return { creator, referral, copyTrade, signup, pending, total: creator + referral + copyTrade + signup };
  }, [pendingCommissions, copyEarnings, signupBonuses]);

  // Normalize all records into a unified list
  const allRecords = useMemo(() => {
    const records: {
      id: string;
      category: TabKey;
      amount: number;
      date: string;
      status: "released" | "pending";
      marketId?: string | null;
    }[] = [];

    (pendingCommissions ?? []).forEach((c) => {
      records.push({
        id: c.id,
        category: c.status === "pending" ? "pending" : (c.type as "creator" | "referral"),
        amount: Number(c.amount),
        date: c.created_at,
        status: c.status as "released" | "pending",
        marketId: c.market_id,
      });
    });

    (copyEarnings ?? []).forEach((c) => {
      records.push({
        id: c.id,
        category: "copy_trade",
        amount: Number(c.commission_amount),
        date: c.created_at,
        status: "released",
        marketId: c.market_id,
      });
    });

    (signupBonuses ?? []).forEach((c) => {
      records.push({
        id: c.id,
        category: "signup_bonus",
        amount: Number(c.amount),
        date: c.created_at,
        status: "released",
      });
    });

    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return records;
  }, [pendingCommissions, copyEarnings, signupBonuses]);

  const filtered = activeTab === "all" ? allRecords : allRecords.filter((r) => r.category === activeTab);

  // Monthly chart data
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; creator: number; referral: number; copy_trade: number; signup_bonus: number }>();
    
    // Only include released/earned records (not pending)
    const earned = allRecords.filter((r) => r.status === "released" && r.category !== "pending");
    
    earned.forEach((r) => {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      if (!map.has(key)) {
        map.set(key, { month: label, creator: 0, referral: 0, copy_trade: 0, signup_bonus: 0 });
      }
      const entry = map.get(key)!;
      if (r.category === "creator") entry.creator += r.amount;
      else if (r.category === "referral") entry.referral += r.amount;
      else if (r.category === "copy_trade") entry.copy_trade += r.amount;
      else if (r.category === "signup_bonus") entry.signup_bonus += r.amount;
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [allRecords]);

  const summaryCards = [
    { label: "Total Earned", value: totals.total, icon: DollarSign, color: "text-green-500 bg-green-500/10" },
    { label: "Creator", value: totals.creator, icon: Sparkles, color: "text-amber-500 bg-amber-500/10" },
    { label: "Referral", value: totals.referral, icon: Users, color: "text-blue-500 bg-blue-500/10" },
    { label: "Copy Trade", value: totals.copyTrade, icon: Copy, color: "text-purple-500 bg-purple-500/10" },
    { label: "Signup Bonus", value: totals.signup, icon: Gift, color: "text-primary bg-primary/10" },
    { label: "Pending", value: totals.pending, icon: Clock, color: "text-muted-foreground bg-muted" },
  ];

  const categoryBadge: Record<string, { label: string; className: string }> = {
    creator: { label: "Creator", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    referral: { label: "Referral", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    copy_trade: { label: "Copy Trade", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
    signup_bonus: { label: "Signup Bonus", className: "bg-primary/10 text-primary border-primary/20" },
    pending: { label: "Pending", className: "bg-muted text-muted-foreground border-border" },
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="flex items-center justify-center pt-32">
          <p className="text-muted-foreground">Please sign in to view commissions.</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar />
      <div className="max-w-2xl mx-auto px-4 pt-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Commission Breakdown</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {summaryCards.map((card) => (
            <Card key={card.label} className="border-border/50">
              <CardContent className="p-3 flex flex-col items-center text-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.color}`}>
                  <card.icon className="w-4 h-4" />
                </div>
                {isLoading ? (
                  <Skeleton className="h-5 w-16" />
                ) : (
                  <span className="text-sm font-bold">{formatAmount(card.value)}</span>
                )}
                <span className="text-[10px] text-muted-foreground leading-tight">{card.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Monthly Earnings Chart */}
        {!isLoading && monthlyData.length > 0 && (
          <Card className="border-border/50 mb-5">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Monthly Earnings
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => [`$${value.toFixed(2)}`, name.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())]}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} formatter={(v) => v.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} />
                  <Bar dataKey="creator" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="referral" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="copy_trade" stackId="a" fill="#a855f7" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="signup_bonus" stackId="a" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* History */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No commission records yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((record) => {
              const badge = categoryBadge[record.category];
              return (
                <div
                  key={record.id}
                  className="glass rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => record.marketId && navigate(`/market/${record.marketId}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badge?.className ?? ""}`}>
                        {badge?.label ?? record.category}
                      </Badge>
                      {record.status === "pending" && (
                        <span className="text-[10px] text-muted-foreground">⏳ 48h hold</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{formatDate(record.date)}</p>
                  </div>
                  <span className="text-sm font-bold text-green-500">+{formatAmount(record.amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default Commissions;
