import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { Users, DollarSign } from "lucide-react";

interface CopyTradeStatsProps {
  userId: string | undefined;
}

const CopyTradeStats = ({ userId }: CopyTradeStatsProps) => {
  const { isFeatureEnabled } = useFeatureToggles();
  const { data } = useQuery({
    queryKey: ["copy-trade-stats", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc("get_copy_trade_stats", {
        _trader_id: userId,
      });
      if (error) throw error;
      return data?.[0] || { total_copiers: 0, total_revenue: 0 };
    },
    enabled: !!userId,
  });

  if (!isFeatureEnabled("copy_trading") || !data || (data.total_copiers === 0 && data.total_revenue === 0)) return null;

  return (
    <div className="glass rounded-xl p-4 mb-6">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Copy Trading Revenue</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold">{Number(data.total_copiers)}</p>
            <p className="text-[10px] text-muted-foreground">Active Copiers</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-primary">${Number(data.total_revenue).toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">Revenue Earned</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CopyTradeStats;
