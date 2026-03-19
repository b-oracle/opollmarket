import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, DollarSign, Users, Gift, Copy, Clock, Sparkles, PieChart as PieChartIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { AnimatePresence, motion } from "framer-motion";

type TabKey = "all" | "creator" | "referral" | "copy_trade" | "signup_bonus" | "pending";

const tabs: { key: TabKey; label: string; icon: typeof DollarSign }[] = [
  { key: "all", label: "All", icon: DollarSign },
  { key: "creator", label: "Creator", icon: Sparkles },
  { key: "referral", label: "Referral", icon: Users },
  { key: "copy_trade", label: "Copy Trade", icon: Copy },
  { key: "signup_bonus", label: "Signup Bonus", icon: Gift },
  { key: "pending", label: "Pending", icon: Clock },
];

const formatAmount = (n: number) => {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
};
const formatDate = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const Commissions = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [showChart, setShowChart] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Fetch pending_commissions (creator + referral, released + pending)
  const { data: pendingCommissions, isLoading: loadingPC } = useQuery({
    queryKey: ["commissions-breakdown", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pending_commissions")
        .select("id, amount, type, status, created_at, releases_at, market_id")
        .eq("user_id", user!.id)
        .neq("type", "bc400")
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
      .filter((c) => c.type === "creator")
      .reduce((s, c) => s + Number(c.amount), 0);
    const referral = (pendingCommissions ?? [])
      .filter((c) => c.type === "referral")
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
        category: c.type as "creator" | "referral",
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

  const filtered = (activeTab === "all"
    ? allRecords
    : activeTab === "pending"
      ? allRecords.filter((r) => r.status === "pending")
      : allRecords.filter((r) => r.category === activeTab)
  ).filter((r) => r.amount >= 0.0001);


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
          <h1 className="text-lg font-bold flex-1">Commission Breakdown</h1>
          {!isLoading && totals.total > 0 && (
            <button
              onClick={() => setShowChart(!showChart)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                showChart ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              Chart
              <ChevronDown className={`w-3 h-3 transition-transform ${showChart ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>

        {/* Pie Chart (collapsible) */}
        <AnimatePresence>
          {showChart && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden mb-5"
            >
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Creator", value: totals.creator },
                          { name: "Referral", value: totals.referral },
                          { name: "Copy Trade", value: totals.copyTrade },
                          { name: "Signup Bonus", value: totals.signup },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill="#f59e0b" />
                        <Cell fill="#3b82f6" />
                        <Cell fill="#a855f7" />
                        <Cell fill="hsl(var(--primary))" />
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`]}
                      />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="text-center text-xs text-muted-foreground mt-1">
                    Total: <span className="font-bold text-foreground">{formatAmount(totals.total)}</span>
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

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
