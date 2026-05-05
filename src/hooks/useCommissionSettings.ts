import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommissionSettings {
  prediction_fee_percent: number;
  creator_fee_percent: number;
  creator_fee_blue_percent: number;
  creator_fee_gold_percent: number;
  referrer_commission_percent: number;
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
  qt_disabled_assets: string;
  auto_resolve_fee: number;
  boost_flash_price: number;
  boost_standard_price: number;
  boost_whale_price: number;
  broadcast_price: number;
  bc400_pool_percent: number;
  osure_enabled: boolean;
  osure_25_premium: number;
  osure_50_premium: number;
  osure_100_premium: number;
  social_ad_price: number;
  ai_generation_cost: number;
  welcome_bonus_percent: number;
  welcome_bonus_cap: number;
  gift_fee_percent: number;
  prediction_min_bet: number;
  prediction_max_bet: number;
  deposit_min_amount: number;
  deposit_max_amount: number;
  push_prompt_cooldown_days: number;
  deposit_expiry_minutes: number;
  max_drafts_none: number;
  max_drafts_blue: number;
  max_drafts_gold: number;
}

export const useCommissionSettings = () => {
  return useQuery({
    queryKey: ["commission_settings"],
    queryFn: async (): Promise<CommissionSettings> => {
      const { data, error } = await supabase
        .from("public_commission_settings" as any)
        .select("prediction_fee_percent, creator_fee_percent, creator_fee_blue_percent, creator_fee_gold_percent, referrer_commission_percent, exit_fee_percent, quick_trade_fee_percent, qt_min_bet, qt_max_bet, qt_streak_2x, qt_streak_3x, qt_streak_4x, qt_streak_5x, qt_enabled_assets, qt_enabled_timeframes, qt_disabled_assets, auto_resolve_fee, boost_flash_price, boost_standard_price, boost_whale_price, broadcast_price, bc400_pool_percent, osure_enabled, osure_25_premium, osure_50_premium, osure_100_premium, social_ad_price, ai_generation_cost, welcome_bonus_percent, welcome_bonus_cap, gift_fee_percent, prediction_min_bet, prediction_max_bet, deposit_min_amount, deposit_max_amount, push_prompt_cooldown_days, deposit_expiry_minutes, max_drafts_none, max_drafts_blue, max_drafts_gold")
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        return {
          prediction_fee_percent: 10,
          creator_fee_percent: 30,
          creator_fee_blue_percent: 30,
          creator_fee_gold_percent: 3,
          referrer_commission_percent: 0,
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
          qt_disabled_assets: "",
          auto_resolve_fee: 0,
          boost_flash_price: 20,
          boost_standard_price: 50,
          boost_whale_price: 150,
          broadcast_price: 5,
          bc400_pool_percent: 0,
          osure_enabled: false,
          osure_25_premium: 10,
          osure_50_premium: 20,
          osure_100_premium: 30,
           social_ad_price: 10,
           ai_generation_cost: 0.5,
           welcome_bonus_percent: 0,
           welcome_bonus_cap: 0,
           gift_fee_percent: 2,
           prediction_min_bet: 1,
           prediction_max_bet: 10000,
           deposit_min_amount: 1,
           deposit_max_amount: 50000,
           push_prompt_cooldown_days: 14,
           deposit_expiry_minutes: 60,
           max_drafts_none: 2,
           max_drafts_blue: 5,
           max_drafts_gold: 10,
         };
      }
      const d = data as any;
      return {
        prediction_fee_percent: Number(d.prediction_fee_percent ?? 10),
        creator_fee_percent: Number(d.creator_fee_percent),
        creator_fee_blue_percent: Number(d.creator_fee_blue_percent ?? d.creator_fee_percent ?? 3),
        creator_fee_gold_percent: Number(d.creator_fee_gold_percent ?? d.creator_fee_percent ?? 3),
        referrer_commission_percent: Number(d.referrer_commission_percent ?? 0),
        exit_fee_percent: Number(d.exit_fee_percent ?? 5),
        quick_trade_fee_percent: Number(d.quick_trade_fee_percent ?? 5),
        qt_min_bet: Number(d.qt_min_bet ?? 1),
        qt_max_bet: Number(d.qt_max_bet ?? 500),
        qt_streak_2x: Number(d.qt_streak_2x ?? 1.05),
        qt_streak_3x: Number(d.qt_streak_3x ?? 1.10),
        qt_streak_4x: Number(d.qt_streak_4x ?? 1.15),
        qt_streak_5x: Number(d.qt_streak_5x ?? 1.25),
        qt_enabled_assets: String(d.qt_enabled_assets ?? "BTC,ETH,BNB,SOL,XRP,DOGE,XAU,XAG,EUR/USD,GBP/USD,USD/JPY"),
        qt_enabled_timeframes: String(d.qt_enabled_timeframes ?? "60,180,300,900"),
        qt_disabled_assets: String(d.qt_disabled_assets ?? ""),
        auto_resolve_fee: Number(d.auto_resolve_fee ?? 0),
        boost_flash_price: Number(d.boost_flash_price ?? 20),
        boost_standard_price: Number(d.boost_standard_price ?? 50),
        boost_whale_price: Number(d.boost_whale_price ?? 150),
        broadcast_price: Number(d.broadcast_price ?? 5),
        bc400_pool_percent: Number(d.bc400_pool_percent ?? 0),
        osure_enabled: d.osure_enabled !== false,
        osure_25_premium: Number(d.osure_25_premium ?? 10),
        osure_50_premium: Number(d.osure_50_premium ?? 20),
        osure_100_premium: Number(d.osure_100_premium ?? 30),
        social_ad_price: Number(d.social_ad_price ?? 10),
        ai_generation_cost: Number(d.ai_generation_cost ?? 0.5),
        welcome_bonus_percent: Number(d.welcome_bonus_percent ?? 0),
        welcome_bonus_cap: Number(d.welcome_bonus_cap ?? 0),
        gift_fee_percent: Number(d.gift_fee_percent ?? 2),
        prediction_min_bet: Number(d.prediction_min_bet ?? 1),
        prediction_max_bet: Number(d.prediction_max_bet ?? 10000),
        deposit_min_amount: Number(d.deposit_min_amount ?? 1),
        deposit_max_amount: Number(d.deposit_max_amount ?? 50000),
        push_prompt_cooldown_days: Number(d.push_prompt_cooldown_days ?? 14),
        deposit_expiry_minutes: Number(d.deposit_expiry_minutes ?? 60),
        max_drafts_none: Number(d.max_drafts_none ?? 2),
        max_drafts_blue: Number(d.max_drafts_blue ?? 5),
        max_drafts_gold: Number(d.max_drafts_gold ?? 10),
      };
    },
    staleTime: 60_000,
  });
};
