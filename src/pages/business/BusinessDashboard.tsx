import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessContext } from "./BusinessLayout";
import { Loader2, TrendingUp, Users, BarChart3, DollarSign, Activity, Zap, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface RecentTrade {
  id: string;
  type: string;
  side: string;
  amount: number;
  market_title: string;
  created_at: string;
}

const BusinessDashboard = () => {
  const { userId } = useBusinessContext();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    marketsCreated: 0,
    totalVolume: 0,
    totalParticipants: 0,
    totalEarnings: 0,
    activeKeys: 0,
    totalApiRequests: 0,
    requestsToday: 0,
    pendingMarkets: 0,
  });
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);

      const [marketsRes, keysRes] = await Promise.all([
        supabase
          .from("markets")
          .select("id, volume, participants, status")
          .eq("creator_wallet", userId),
        supabase
          .from("api_keys" as any)
          .select("id, is_active")
          .eq("owner_id", userId),
      ]);

      const markets = marketsRes.data || [];
      const keys = (keysRes.data as any[]) || [];
      const keyIds = keys.map((k: any) => k.id);

      // Parallel fetch: earnings, API request counts, recent trades
      const [earningsRes, requestsRes, todayRequestsRes, tradesRes] = await Promise.all([
        keyIds.length > 0
          ? supabase.from("affiliate_earnings").select("commission_amount").in("api_key_id", keyIds)
          : Promise.resolve({ data: [] }),
        keyIds.length > 0
          ? supabase.from("api_request_logs").select("id", { count: "exact", head: true }).in("api_key_id", keyIds)
          : Promise.resolve({ count: 0 }),
        keyIds.length > 0
          ? supabase.from("api_request_logs").select("id", { count: "exact", head: true }).in("api_key_id", keyIds).gte("created_at", new Date(Date.now() - 86400000).toISOString())
          : Promise.resolve({ count: 0 }),
        supabase
          .from("transactions")
          .select("id, type, side, amount, market_id, created_at, markets(title)")
          .eq("user_id", userId)
          .in("type", ["buy", "sell"])
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const totalEarnings = ((earningsRes as any).data || []).reduce((sum: number, e: any) => sum + Number(e.commission_amount), 0);

      setStats({
        marketsCreated: markets.length,
        totalVolume: markets.reduce((sum, m) => sum + Number(m.volume || 0), 0),
        totalParticipants: markets.reduce((sum, m) => sum + Number(m.participants || 0), 0),
        totalEarnings,
        activeKeys: keys.filter((k: any) => k.is_active).length,
        totalApiRequests: (requestsRes as any).count || 0,
        requestsToday: (todayRequestsRes as any).count || 0,
        pendingMarkets: markets.filter(m => m.status === "pending").length,
      });

      setRecentTrades(
        (tradesRes.data || []).map((t: any) => ({
          id: t.id,
          type: t.type,
          side: t.side,
          amount: t.amount,
          market_title: t.markets?.title || "Unknown",
          created_at: t.created_at,
        }))
      );

      setLoading(false);
    };

    fetchStats();
  }, [userId]);

  const cards = [
    { label: "Markets Created", value: stats.marketsCreated.toLocaleString(), icon: BarChart3, color: "text-primary" },
    { label: "Total Volume", value: `$${stats.totalVolume.toFixed(2)}`, icon: TrendingUp, color: "text-emerald-500" },
    { label: "Total Participants", value: stats.totalParticipants.toLocaleString(), icon: Users, color: "text-blue-500" },
    { label: "API Earnings", value: `$${stats.totalEarnings.toFixed(2)}`, icon: DollarSign, color: "text-amber-500" },
  ];

  const secondaryCards = [
    { label: "Active API Keys", value: stats.activeKeys, icon: Zap, color: "text-primary" },
    { label: "Total API Requests", value: stats.totalApiRequests.toLocaleString(), icon: Activity, color: "text-violet-500" },
    { label: "Requests Today", value: stats.requestsToday.toLocaleString(), icon: Activity, color: "text-cyan-500" },
    { label: "Pending Markets", value: stats.pendingMarkets, icon: BarChart3, color: "text-orange-500" },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Business Dashboard</h2>
        <p className="text-sm text-muted-foreground">Overview of your markets, API performance, and earnings</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <p className="text-[11px] text-muted-foreground font-medium">{c.label}</p>
            </div>
            <p className="text-lg font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {secondaryCards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
              <p className="text-[10px] text-muted-foreground font-medium">{c.label}</p>
            </div>
            <p className="text-base font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Recent trades */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Recent Trades</h3>
        {recentTrades.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No recent trades</p>
        ) : (
          <div className="space-y-2">
            {recentTrades.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  {t.type === "buy" ? (
                    <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-red-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{t.market_title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.type.toUpperCase()} {t.side?.toUpperCase()} · {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${t.type === "sell" ? "text-emerald-500" : "text-foreground"}`}>
                  ${Number(t.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BusinessDashboard;
