import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Users, MessageSquare, ShoppingBag, Loader2, DollarSign, Activity, Gift, UserPlus, Zap, UserCheck, Heart, ArrowDownLeft, ArrowUpRight, Wallet, Scale, Info, Landmark } from "lucide-react";
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
  totalDeposits: number;
  totalWithdrawals: number;
  depositCount: number;
  withdrawalCount: number;
  pendingDepositCount: number;
  pendingWithdrawalCount: number;
  grossDeposits: number;
  grossDepositCount: number;
  pendingDepositsAmount: number;
  expiredDepositsAmount: number;
  expiredDepositCount: number;
  partialDepositsAmount: number;
  partialDepositCount: number;
  providerBreakdown: { provider: string; amount: number; count: number }[];
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

type DepositRangeKey = "7d" | "30d" | "90d" | "all";
const DEPOSIT_RANGES: { key: DepositRangeKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "all", label: "All", days: null },
];

interface DepositTxn {
  amount: number;
  status: string;
  payment_provider: string | null;
  created_at: string;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryData, setCategoryData] = useState<{ name: string; volume: number; count: number }[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [activityData, setActivityData] = useState<{ date: string; markets: number; bets: number }[]>([]);
  const [allDepositTxns, setAllDepositTxns] = useState<DepositTxn[]>([]);
  const [depositRange, setDepositRange] = useState<DepositRangeKey>("all");
  const [platformPoolBalance, setPlatformPoolBalance] = useState<number>(0);
  const [qtRevenuePool, setQtRevenuePool] = useState<number>(0);

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

      // Batch-fetch ALL market rows to avoid 1000-row cap
      const fetchAllMarketRows = async () => {
        const allRows: { category: string; volume: number; status: string; created_at: string }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase.from("markets").select("category, volume, status, created_at").range(from, from + batchSize - 1);
          if (error || !data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return allRows;
      };
      const marketRows = await fetchAllMarketRows();
      const { data: txnRows } = await supabase.from("transactions").select("created_at, amount");

      // For monetary totals, we need ALL rows — fetch in batches to avoid 1000-row cap
      const fetchAllAmounts = async (table: "referral_rewards" | "quick_bets"): Promise<{ amount: number }[]> => {
        const allRows: { amount: number }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase.from(table).select("amount").range(from, from + batchSize - 1);
          if (error || !data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return allRows;
      };

      const fetchTxAmounts = async (type: string, status?: string): Promise<{ amount: number }[]> => {
        const allRows: { amount: number }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          let q = supabase.from("transactions").select("amount").eq("type", type).range(from, from + batchSize - 1);
          if (status) q = q.eq("status", status);
          const { data, error } = await q;
          if (error || !data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return allRows;
      };

      const fetchTxAmountsByStatuses = async (type: string, statuses: string[]): Promise<{ amount: number }[]> => {
        const allRows: { amount: number }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase.from("transactions").select("amount").eq("type", type).in("status", statuses).range(from, from + batchSize - 1);
          if (error || !data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return allRows;
      };

      const [rewardRows, qtBetRows, depositRows, withdrawalRows, depositCount, withdrawalCount, pendingDepositCount, pendingWithdrawalCount, grossDepositRows, grossDepositCount, pendingDepositRows, expiredDepositRows, expiredDepositCount, partialDepositRows, partialDepositCount] = await Promise.all([
        fetchAllAmounts("referral_rewards"),
        (async () => {
          const allRows: { amount: number }[] = [];
          let from = 0;
          const batchSize = 1000;
          while (true) {
            const { data, error } = await supabase.from("quick_bets").select("amount").in("status", ["won", "lost"]).range(from, from + batchSize - 1);
            if (error || !data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < batchSize) break;
            from += batchSize;
          }
          return allRows;
        })(),
        fetchTxAmounts("deposit", "confirmed"),
        fetchTxAmounts("withdrawal", "confirmed"),
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "deposit").eq("status", "confirmed"),
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "withdrawal").eq("status", "confirmed"),
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "deposit").eq("status", "pending"),
        supabase.from("withdrawal_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        // Reconciliation data
        fetchTxAmountsByStatuses("deposit", ["confirmed", "partial", "pending", "expired"]),
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "deposit"),
        fetchTxAmounts("deposit", "pending"),
        fetchTxAmounts("deposit", "expired"),
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "deposit").eq("status", "expired"),
        fetchTxAmounts("deposit", "partial"),
        supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "deposit").eq("status", "partial"),
      ]);

      // Fetch provider breakdown for credited deposits (confirmed + partial)
      const fetchProviderBreakdown = async (): Promise<{ provider: string; amount: number; count: number }[]> => {
        const allRows: { amount: number; payment_provider: string | null }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase.from("transactions").select("amount, payment_provider").eq("type", "deposit").in("status", ["confirmed", "partial"]).range(from, from + batchSize - 1);
          if (error || !data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        const map = new Map<string, { amount: number; count: number }>();
        allRows.forEach(r => {
          const key = r.payment_provider === "payaza" ? "fiat" : "crypto";
          const e = map.get(key) || { amount: 0, count: 0 };
          e.amount += Number(r.amount);
          e.count++;
          map.set(key, e);
        });
        return Array.from(map.entries()).map(([provider, d]) => ({ provider, ...d }));
      };
      const providerBreakdown = await fetchProviderBreakdown();

      // Fetch ALL deposit transactions with dates for time-range filtering
      const fetchAllDepositTxns = async (): Promise<DepositTxn[]> => {
        const rows: DepositTxn[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase.from("transactions").select("amount, status, payment_provider, created_at").eq("type", "deposit").range(from, from + batchSize - 1);
          if (error || !data || data.length === 0) break;
          rows.push(...(data as DepositTxn[]));
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return rows;
      };
      setAllDepositTxns(await fetchAllDepositTxns());

      // Use transactions as source of truth for prediction volume (buys + sells)
      const [predictionBuyRows, predictionSellRows] = await Promise.all([
        fetchTxAmounts("buy", "confirmed"),
        fetchTxAmounts("sell", "confirmed"),
      ]);
      const totalVolume = [...predictionBuyRows, ...predictionSellRows].reduce((sum, r) => sum + Number(r.amount), 0);
      const totalRewardsPaid = rewardRows.reduce((sum, r) => sum + Number(r.amount), 0);
      const quickTradeVolume = qtBetRows.reduce((sum, b) => sum + Number(b.amount), 0);
      const totalDeposits = depositRows.reduce((sum, r) => sum + Number(r.amount), 0);
      const totalWithdrawals = withdrawalRows.reduce((sum, r) => sum + Number(r.amount), 0);
      const grossDeposits = grossDepositRows.reduce((sum, r) => sum + Number(r.amount), 0);
      const pendingDepositsAmount = pendingDepositRows.reduce((sum, r) => sum + Number(r.amount), 0);
      const expiredDepositsAmount = expiredDepositRows.reduce((sum, r) => sum + Number(r.amount), 0);
      const partialDepositsAmount = partialDepositRows.reduce((sum, r) => sum + Number(r.amount), 0);

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
        totalDeposits,
        totalWithdrawals,
        depositCount: depositCount.count ?? 0,
        withdrawalCount: withdrawalCount.count ?? 0,
        pendingDepositCount: pendingDepositCount.count ?? 0,
        pendingWithdrawalCount: pendingWithdrawalCount.count ?? 0,
        grossDeposits,
        grossDepositCount: grossDepositCount.count ?? 0,
        pendingDepositsAmount,
        expiredDepositsAmount,
        expiredDepositCount: expiredDepositCount.count ?? 0,
        partialDepositsAmount,
        partialDepositCount: partialDepositCount.count ?? 0,
        providerBreakdown,
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

      // Fetch platform pool balance
      const { data: poolData } = await supabase
        .from("platform_pool")
        .select("balance")
        .limit(1)
        .single();
      setPlatformPoolBalance(Number(poolData?.balance || 0));

      // Calculate QT revenue pool (Wagered - Payouts - Refunded - Bonus)
      const fetchAllQtBets = async () => {
        const rows: { amount: number; payout: number | null; status: string }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase.from("quick_bets").select("amount, payout, status").range(from, from + batchSize - 1);
          if (error || !data || data.length === 0) break;
          rows.push(...data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return rows;
      };
      const fetchAllBonusTxs = async () => {
        const rows: { amount: number }[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data, error } = await supabase.from("transactions").select("amount").eq("type", "qt_one_sided_bonus").eq("status", "confirmed").range(from, from + batchSize - 1);
          if (error || !data || data.length === 0) break;
          rows.push(...data);
          if (data.length < batchSize) break;
          from += batchSize;
        }
        return rows;
      };
      const [allQtBets, allBonusTxs] = await Promise.all([fetchAllQtBets(), fetchAllBonusTxs()]);
      const qtWagered = allQtBets.filter(b => b.status === "won" || b.status === "lost").reduce((s, b) => s + Number(b.amount), 0);
      const qtPayouts = allQtBets.filter(b => b.status === "won").reduce((s, b) => s + Number(b.payout || 0), 0);
      const qtRefunded = allQtBets.filter(b => b.status === "refunded").reduce((s, b) => s + Number(b.payout || 0), 0);
      const qtBonusPaid = allBonusTxs.reduce((s, t) => s + Number(t.amount), 0);
      setQtRevenuePool(qtWagered - qtPayouts - qtRefunded - qtBonusPaid);

      setLoading(false);
    };
    fetchAll();
  }, []);


  const depositRecon = useMemo(() => {
    const rangeDef = DEPOSIT_RANGES.find(r => r.key === depositRange)!;
    let cutoff = "";
    if (rangeDef.days) {
      const d = new Date();
      d.setDate(d.getDate() - rangeDef.days);
      cutoff = d.toISOString();
    }
    const filtered = rangeDef.days ? allDepositTxns.filter(t => t.created_at >= cutoff) : allDepositTxns;
    const gross = filtered.reduce((s, t) => s + Number(t.amount), 0);
    const grossCount = filtered.length;
    const confirmed = filtered.filter(t => t.status === "confirmed");
    const partial = filtered.filter(t => t.status === "partial");
    const pending = filtered.filter(t => t.status === "pending");
    const expired = filtered.filter(t => t.status === "expired");
    const confirmedAmt = confirmed.reduce((s, t) => s + Number(t.amount), 0);
    const partialAmt = partial.reduce((s, t) => s + Number(t.amount), 0);
    const pendingAmt = pending.reduce((s, t) => s + Number(t.amount), 0);
    const expiredAmt = expired.reduce((s, t) => s + Number(t.amount), 0);
    const credited = confirmedAmt + partialAmt;
    const provMap = new Map<string, { amount: number; count: number }>();
    [...confirmed, ...partial].forEach(t => {
      const key = t.payment_provider === "payaza" ? "fiat" : "crypto";
      const e = provMap.get(key) || { amount: 0, count: 0 };
      e.amount += Number(t.amount);
      e.count++;
      provMap.set(key, e);
    });
    const providers = Array.from(provMap.entries()).map(([provider, d]) => ({ provider, ...d }));
    return { gross, grossCount, credited, confirmedCount: confirmed.length, partialCount: partial.length, pendingAmt, pendingCount: pending.length, expiredAmt, expiredCount: expired.length, providers };
  }, [allDepositTxns, depositRange]);

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
    { label: "Prediction Volume", value: (stats?.totalVolume ?? 0) >= 1000 ? `$${((stats?.totalVolume ?? 0) / 1000).toFixed(1)}K` : `$${(stats?.totalVolume ?? 0).toFixed(2)}`, icon: TrendingUp, color: "text-green-500" },
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

      {/* Platform Pool Balance Card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Landmark className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Platform Revenue Pool</h3>
        </div>
        <p className="text-3xl font-bold text-primary">
          {platformPoolBalance >= 1000 ? `$${(platformPoolBalance / 1000).toFixed(1)}K` : `$${platformPoolBalance.toFixed(2)}`}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Accumulated platform fees (prediction fees, withdrawal fees). Creator & referral commissions are paid out from this pool.
        </p>
      </div>

      {/* Quick Trade Revenue Pool Card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-semibold">Quick Trade Revenue Pool</h3>
        </div>
        <p className={`text-3xl font-bold ${qtRevenuePool >= 0 ? "text-green-500" : "text-red-500"}`}>
          {qtRevenuePool >= 1000 ? `$${(qtRevenuePool / 1000).toFixed(1)}K` : qtRevenuePool <= -1000 ? `-$${(Math.abs(qtRevenuePool) / 1000).toFixed(1)}K` : `$${qtRevenuePool.toFixed(2)}`}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Quick Trade profit (Wagered − Payouts − Refunded − Bonus). One-sided bonuses are paid from this pool.
        </p>
      </div>

      {/* Financial Overview Card */}
      {stats && (() => {
        const dep = stats.totalDeposits;
        const wd = stats.totalWithdrawals;
        const net = dep - wd;
        const maxVal = Math.max(dep, wd, 1);
        const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(2)}`;
        return (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold">Financial Overview</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Deposits</span>
                </div>
                <p className="text-xl font-bold text-green-500">{fmt(dep)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] text-muted-foreground">{stats.depositCount} confirmed</p>
                  {stats.pendingDepositCount > 0 && (
                    <span className="text-[10px] font-semibold text-yellow-500 bg-yellow-500/10 rounded px-1 py-0.5">{stats.pendingDepositCount} pending</span>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Withdrawals</span>
                </div>
                <p className="text-xl font-bold text-yellow-500">{fmt(wd)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] text-muted-foreground">{stats.withdrawalCount} confirmed</p>
                  {stats.pendingWithdrawalCount > 0 && (
                    <span className="text-[10px] font-semibold text-orange-500 bg-orange-500/10 rounded px-1 py-0.5">{stats.pendingWithdrawalCount} pending</span>
                  )}
                </div>
              </div>
              <div className={`rounded-lg p-3 ${net >= 0 ? 'bg-primary/5 border border-primary/10' : 'bg-destructive/5 border border-destructive/10'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className={`w-3.5 h-3.5 ${net >= 0 ? 'text-primary' : 'text-destructive'}`} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Net Balance</span>
                </div>
                <p className={`text-xl font-bold ${net >= 0 ? 'text-primary' : 'text-destructive'}`}>{net < 0 ? '-' : ''}{fmt(Math.abs(net))}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">deposits − withdrawals</p>
              </div>
            </div>
            {/* Progress bars */}
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Deposits</span>
                  <span className="text-[10px] font-bold text-green-500">{fmt(dep)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(dep / maxVal) * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Withdrawals</span>
                  <span className="text-[10px] font-bold text-yellow-500">{fmt(wd)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500 rounded-full transition-all" style={{ width: `${(wd / maxVal) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Deposit Reconciliation Card */}
      {(() => {
        const { gross, grossCount, credited, confirmedCount, partialCount, pendingAmt, pendingCount, expiredAmt, expiredCount, providers } = depositRecon;
        const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(2)}`;
        const maxBar = Math.max(gross, 1);

        return (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold">Deposit Reconciliation</h3>
              </div>
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
                {DEPOSIT_RANGES.map(r => (
                  <button key={r.key} onClick={() => setDepositRange(r.key)} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${depositRange === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r.label}</button>
                ))}
              </div>
            </div>

            {/* Breakdown grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="rounded-lg bg-muted/30 border border-border p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Gross Requested</span>
                <p className="text-lg font-bold">{fmt(gross)}</p>
                <p className="text-[10px] text-muted-foreground">{grossCount} total deposits</p>
              </div>
              <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Net Credited</span>
                <p className="text-lg font-bold text-green-500">{fmt(credited)}</p>
                <p className="text-[10px] text-muted-foreground">{confirmedCount} confirmed{partialCount > 0 ? ` + ${partialCount} partial` : ''}</p>
              </div>
              <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Pending</span>
                <p className="text-lg font-bold text-yellow-500">{fmt(pendingAmt)}</p>
                <p className="text-[10px] text-muted-foreground">{pendingCount} awaiting</p>
              </div>
              <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Expired</span>
                <p className="text-lg font-bold text-destructive">{fmt(expiredAmt)}</p>
                <p className="text-[10px] text-muted-foreground">{expiredCount} never completed</p>
              </div>
            </div>

            {/* Stacked bar visualization */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-medium">Deposit Breakdown</span>
                <span className="text-[10px] font-bold">{fmt(gross)}</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden flex">
                {credited > 0 && (
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${(credited / maxBar) * 100}%` }} title={`Credited: ${fmt(credited)}`} />
                )}
                {pendingAmt > 0 && (
                  <div className="h-full bg-yellow-500 transition-all" style={{ width: `${(pendingAmt / maxBar) * 100}%` }} title={`Pending: ${fmt(pendingAmt)}`} />
                )}
                {expiredAmt > 0 && (
                  <div className="h-full bg-destructive transition-all" style={{ width: `${(expiredAmt / maxBar) * 100}%` }} title={`Expired: ${fmt(expiredAmt)}`} />
                )}
              </div>
              <div className="flex items-center gap-4 mt-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-[10px] text-muted-foreground">Credited ({fmt(credited)})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                  <span className="text-[10px] text-muted-foreground">Pending ({fmt(pendingAmt)})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
                  <span className="text-[10px] text-muted-foreground">Expired ({fmt(expiredAmt)})</span>
                </div>
              </div>
            </div>

            {/* Provider Breakdown */}
            {providers.length > 0 && (
              <div className="mt-4">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block mb-2">Credited by Provider</span>
                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const crypto = providers.find(p => p.provider === "crypto");
                    const fiat = providers.find(p => p.provider === "fiat");
                    return (
                      <>
                        <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-[10px] text-muted-foreground font-medium">Crypto (Stablecoins)</span>
                          </div>
                          <p className="text-base font-bold text-blue-500">{fmt(crypto?.amount ?? 0)}</p>
                          <p className="text-[10px] text-muted-foreground">{crypto?.count ?? 0} deposits</p>
                        </div>
                        <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="text-[10px] text-muted-foreground font-medium">Fiat (NGN)</span>
                          </div>
                          <p className="text-base font-bold text-amber-500">{fmt(fiat?.amount ?? 0)}</p>
                          <p className="text-[10px] text-muted-foreground">{fiat?.count ?? 0} deposits</p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Info note */}
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/30 border border-border p-3">
              <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <strong>Net Credited</strong> reflects actual funds added to user balances (after payment processor fees) across all providers (crypto &amp; fiat/NGN). 
                <strong> Gross Requested</strong> includes all deposit attempts. For crypto deposits, the difference is due to processor fees (~0.5-1%) deducted before crediting. 
                For fiat (NGN) deposits, the credited amount reflects the USD equivalent at the exchange rate applied.
              </p>
            </div>
          </div>
        );
      })()}

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
