import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Users, MessageSquare, ShoppingBag, Loader2 } from "lucide-react";

interface Stats {
  totalMarkets: number;
  totalComments: number;
  totalVolume: number;
  activeBoosts: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [markets, comments, boosts] = await Promise.all([
        supabase.from("markets").select("*", { count: "exact", head: true }),
        supabase.from("comments").select("*", { count: "exact", head: true }),
        supabase.from("market_boosts").select("*", { count: "exact", head: true }).eq("status", "active"),
      ]);

      const { data: volumeData } = await supabase.from("markets").select("volume");
      const totalVolume = volumeData?.reduce((sum, m) => sum + Number(m.volume), 0) ?? 0;

      setStats({
        totalMarkets: markets.count ?? 0,
        totalComments: comments.count ?? 0,
        totalVolume,
        activeBoosts: boosts.count ?? 0,
      });
      setLoading(false);
    };
    fetchStats();
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
    { label: "Total Comments", value: stats?.totalComments ?? 0, icon: MessageSquare, color: "text-yellow-500" },
    { label: "Total Volume", value: `$${((stats?.totalVolume ?? 0) / 1000).toFixed(0)}K`, icon: TrendingUp, color: "text-green-500" },
    { label: "Active Boosts", value: stats?.activeBoosts ?? 0, icon: Users, color: "text-purple-500" },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-2xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-2">Quick Actions</h3>
        <p className="text-xs text-muted-foreground">Use the sidebar to manage markets, moderate comments, and manage users.</p>
      </div>
    </div>
  );
};

export default AdminDashboard;
