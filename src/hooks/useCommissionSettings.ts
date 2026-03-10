import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommissionSettings {
  admin_fee_percent: number;
  creator_fee_percent: number;
  exit_fee_percent: number;
  quick_trade_fee_percent: number;
  qt_min_bet: number;
  qt_max_bet: number;
  qt_streak_2x: number;
  qt_streak_3x: number;
  qt_streak_4x: number;
  qt_streak_5x: number;
  qt_enabled_assets: string;
  qt_enabled_timeframes: string;
}

export const useCommissionSettings = () => {
  return useQuery({
    queryKey: ["commission_settings"],
    queryFn: async (): Promise<CommissionSettings> => {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("admin_fee_percent, creator_fee_percent, exit_fee_percent, quick_trade_fee_percent, qt_min_bet, qt_max_bet, qt_streak_2x, qt_streak_3x, qt_streak_4x, qt_streak_5x, qt_enabled_assets, qt_enabled_timeframes")
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return {
          admin_fee_percent: 2,
          creator_fee_percent: 3,
          exit_fee_percent: 5,
          quick_trade_fee_percent: 5,
          qt_min_bet: 1,
          qt_max_bet: 500,
          qt_streak_2x: 1.05,
          qt_streak_3x: 1.10,
          qt_streak_4x: 1.15,
          qt_streak_5x: 1.25,
          qt_enabled_assets: "BTC,ETH,BNB,SOL,XRP,DOGE,XAU,XAG,EUR/USD,GBP/USD,USD/JPY",
          qt_enabled_timeframes: "60,180,300,900",
        };
      }
      const d = data as any;
      return {
        admin_fee_percent: Number(d.admin_fee_percent),
        creator_fee_percent: Number(d.creator_fee_percent),
        exit_fee_percent: Number(d.exit_fee_percent ?? 5),
        quick_trade_fee_percent: Number(d.quick_trade_fee_percent ?? 5),
        qt_min_bet: Number(d.qt_min_bet ?? 1),
        qt_max_bet: Number(d.qt_max_bet ?? 500),
        qt_streak_2x: Number(d.qt_streak_2x ?? 1.05),
        qt_streak_3x: Number(d.qt_streak_3x ?? 1.10),
        qt_streak_4x: Number(d.qt_streak_4x ?? 1.15),
        qt_streak_5x: Number(d.qt_streak_5x ?? 1.25),
        qt_enabled_assets: String(d.qt_enabled_assets ?? "BTC,ETH,BNB,SOL,XRP,DOGE"),
        qt_enabled_timeframes: String(d.qt_enabled_timeframes ?? "60,180,300,900"),
      };
    },
    staleTime: 60_000,
  });
};
