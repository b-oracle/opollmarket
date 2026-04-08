import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessContext } from "./BusinessLayout";
import { Loader2, TrendingUp, Users, BarChart3, DollarSign } from "lucide-react";

const BusinessDashboard = () => {
  const { userId } = useBusinessContext();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    marketsCreated: 0,
    totalVolume: 0,
    totalParticipants: 0,
    totalEarnings: 0,
    activeKeys: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);

      const [marketsRes, keysRes] = await Promise.all([
        supabase
          .from("markets")
          .select("id, volume, participants")
          .eq("creator_wallet", userId),
        supabase
          .from("api_keys" as any)
          .select("id, is_active")
          .eq("owner_id", userId),
      ]);

      const markets = marketsRes.data || [];
      const keys = (keysRes.data as any[]) || [];

      // Fetch affiliate earnings for user's keys
      const keyIds = keys.map((k: any) => k.id);
      let totalEarnings = 0;
      if (keyIds.length > 0) {
        const { data: earnings } = await supabase
          .from("affiliate_earnings")
          .select("commission_amount")
          .in("api_key_id", keyIds);
        totalEarnings = (earnings || []).reduce((sum, e) => sum + Number(e.commission_amount), 0);
      }

      setStats({
        marketsCreated: markets.length,
        totalVolume: markets.reduce((sum, m) => sum + Number(m.volume || 0), 0),
        totalParticipants: markets.reduce((sum, m) => sum + Number(m.participants || 0), 0),
        totalEarnings,
        activeKeys: keys.filter((k: any) => k.is_active).length,
      });
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
        <p className="text-sm text-muted-foreground">Overview of your markets and API performance</p>
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

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2">Active API Keys</h3>
        <p className="text-2xl font-bold text-primary">{stats.activeKeys}</p>
        <p className="text-xs text-muted-foreground mt-1">Manage your keys in the API Keys tab</p>
      </div>
    </div>
  );
};

export default BusinessDashboard;
