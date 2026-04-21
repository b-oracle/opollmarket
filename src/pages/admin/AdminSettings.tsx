import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Percent, Gift, Coins, ArrowUpFromLine, LogOut, Zap, Flame, DollarSign, Timer, Globe, Plus, Trash2, RefreshCw, ToggleLeft, Copy, ShieldCheck, Sparkles, Banknote, Shield, Droplets, Phone } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminContext } from "./AdminLayout";
import { Badge } from "@/components/ui/badge";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { logAuditEvent } from "@/lib/auditLog";
import { resetOnboarding, hasCompletedOnboarding } from "@/hooks/useFirstRun";

const ALL_ASSETS = [
  { symbol: "BTC", label: "Bitcoin" },
  { symbol: "ETH", label: "Ethereum" },
  { symbol: "BNB", label: "BNB" },
  { symbol: "SOL", label: "Solana" },
  { symbol: "XRP", label: "XRP" },
  { symbol: "DOGE", label: "Dogecoin" },
  { symbol: "XAU", label: "Gold" },
  { symbol: "XAG", label: "Silver" },
  { symbol: "XPT", label: "Platinum" },
  { symbol: "XPD", label: "Palladium" },
  { symbol: "NG", label: "Natural Gas" },
  { symbol: "COPPER", label: "Copper" },
  { symbol: "WTI", label: "WTI Crude Oil" },
  { symbol: "BRENT", label: "Brent Crude" },
  { symbol: "EUR/USD", label: "EUR/USD" },
  { symbol: "GBP/USD", label: "GBP/USD" },
  { symbol: "USD/JPY", label: "USD/JPY" },
  { symbol: "AUD/USD", label: "AUD/USD" },
  { symbol: "USD/CHF", label: "USD/CHF" },
  { symbol: "USD/CAD", label: "USD/CAD" },
  { symbol: "NZD/USD", label: "NZD/USD" },
  { symbol: "EUR/GBP", label: "EUR/GBP" },
];

const ALL_TIMEFRAMES = [
  { seconds: 60, label: "1 Minute" },
  { seconds: 180, label: "3 Minutes" },
  { seconds: 300, label: "5 Minutes" },
  { seconds: 900, label: "15 Minutes" },
];

const AdminSettings = () => {
  const { canEdit, isSuperAdmin } = useAdminContext();
  const [predictionFee, setPredictionFee] = useState("10");
  // admin_fee_percent is no longer configurable — platform keeps the remainder
  const [creatorFee, setCreatorFee] = useState("");
  const [creatorFeeBlue, setCreatorFeeBlue] = useState("");
  const [creatorFeeGold, setCreatorFeeGold] = useState("");
  const [referrerCommission, setReferrerCommission] = useState("");
  const [referralReward, setReferralReward] = useState("");
  const [minTokenBalance, setMinTokenBalance] = useState("");
  const [minGoldTokenBalance, setMinGoldTokenBalance] = useState("");
  const [minNftBalance, setMinNftBalance] = useState("");
  const [minWithdrawalAmount, setMinWithdrawalAmount] = useState("");
  const [withdrawalCooldown, setWithdrawalCooldown] = useState("");
  const [withdrawalMultiplier, setWithdrawalMultiplier] = useState("");
  const [kycTier1DailyLimit, setKycTier1DailyLimit] = useState("500");
  const [kycTier2DailyLimit, setKycTier2DailyLimit] = useState("50000");
  const [maxDailyWithdrawals, setMaxDailyWithdrawals] = useState("5");
  const [withdrawalLimitEnabled, setWithdrawalLimitEnabled] = useState(true);
  const [exitFee, setExitFee] = useState("");
  const [liquidityReturnFee, setLiquidityReturnFee] = useState("");
  const [minLiquidity, setMinLiquidity] = useState("");
  const [withdrawalFee, setWithdrawalFee] = useState("");
  const [copyTradeCommission, setCopyTradeCommission] = useState("");
  const [quickTradeFee, setQuickTradeFee] = useState("");
  const [qtMinBet, setQtMinBet] = useState("");
  const [qtMaxBet, setQtMaxBet] = useState("");
  const [qtStreak2, setQtStreak2] = useState("");
  const [qtStreak3, setQtStreak3] = useState("");
  const [qtStreak4, setQtStreak4] = useState("");
  const [qtStreak5, setQtStreak5] = useState("");
  const [qtOneSidedBonus, setQtOneSidedBonus] = useState(true);
  const [qtEnabledAssets, setQtEnabledAssets] = useState<Set<string>>(new Set(ALL_ASSETS.map(a => a.symbol)));
  const [qtDisabledAssets, setQtDisabledAssets] = useState<Set<string>>(new Set());
  const [qtEnabledTimeframes, setQtEnabledTimeframes] = useState<Set<number>>(new Set(ALL_TIMEFRAMES.map(t => t.seconds)));
  const [blueRevenueShare, setBlueRevenueShare] = useState("");
  const [goldRevenueShare, setGoldRevenueShare] = useState("");
  const [blueTrendingMult, setBlueTrendingMult] = useState("");
  const [goldTrendingMult, setGoldTrendingMult] = useState("");
  const [blueMaxFreeMarkets, setBlueMaxFreeMarkets] = useState("5");
  const [goldMaxFreeMarkets, setGoldMaxFreeMarkets] = useState("20");
  const [aiGenerationCost, setAiGenerationCost] = useState("0.50");
  const [autoResolveFee, setAutoResolveFee] = useState("0");
  const [boostFlashPrice, setBoostFlashPrice] = useState("20");
  const [boostStandardPrice, setBoostStandardPrice] = useState("50");
  const [boostWhalePrice, setBoostWhalePrice] = useState("150");
  const [broadcastPrice, setBroadcastPrice] = useState("5");
  const [bc400PoolPercent, setBc400PoolPercent] = useState("0");
  const [osureEnabled, setOsureEnabled] = useState(true);
  const [osure25Premium, setOsure25Premium] = useState("10");
  const [osure50Premium, setOsure50Premium] = useState("20");
  const [osure100Premium, setOsure100Premium] = useState("30");
  const [welcomeBonusPercent, setWelcomeBonusPercent] = useState("0");
  const [welcomeBonusCap, setWelcomeBonusCap] = useState("0");
  const [giftFeePercent, setGiftFeePercent] = useState("2");
  const [predictionMinBet, setPredictionMinBet] = useState("1");
  const [predictionMaxBet, setPredictionMaxBet] = useState("10000");
  const [depositMinAmount, setDepositMinAmount] = useState("1");
  const [depositMaxAmount, setDepositMaxAmount] = useState("50000");
  const [pushPromptCooldownDays, setPushPromptCooldownDays] = useState("14");
  const [depositExpiryMinutes, setDepositExpiryMinutes] = useState("60");
  const [maxDraftsNone, setMaxDraftsNone] = useState("2");
  const [maxDraftsBlue, setMaxDraftsBlue] = useState("5");
  const [maxDraftsGold, setMaxDraftsGold] = useState("10");
  const [payazaMode, setPayazaMode] = useState<"checkout_sdk" | "direct_api">("direct_api"); // kept for save compatibility
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [fcmTesting, setFcmTesting] = useState(false);
  const [fcmTestToken, setFcmTestToken] = useState("");
  const [fcmTestResult, setFcmTestResult] = useState<any>(null);
  const [fcmTestError, setFcmTestError] = useState<string | null>(null);

  // Test incoming-call push
  const [callTestQuery, setCallTestQuery] = useState("");
  const [callTestResults, setCallTestResults] = useState<
    Array<{ id: string; display_name: string | null; username: string | null; avatar_url: string | null }>
  >([]);
  const [callTestSearching, setCallTestSearching] = useState(false);
  const [callTestTarget, setCallTestTarget] = useState<{
    id: string;
    display_name: string | null;
    username: string | null;
  } | null>(null);
  const [callTestSending, setCallTestSending] = useState(false);
  const [callTestResult, setCallTestResult] = useState<any>(null);
  const [callTestError, setCallTestError] = useState<string | null>(null);

  const runFcmTest = async () => {
    setFcmTesting(true);
    setFcmTestResult(null);
    setFcmTestError(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-fcm-push", {
        body: { test: true, token: fcmTestToken.trim() || undefined },
      });
      if (error) {
        setFcmTestError(`Invoke error: ${error.message}`);
      } else {
        setFcmTestResult(data);
        if ((data as any)?.ok) toast.success("FCM credentials valid");
        else toast.error(`FCM test failed at stage: ${(data as any)?.stage ?? "unknown"}`);
      }
    } catch (e) {
      setFcmTestError(`Error: ${(e as Error).message}`);
    } finally {
      setFcmTesting(false);
    }
  };

  // Search users for the test-call picker
  useEffect(() => {
    const q = callTestQuery.trim();
    if (q.length < 2) {
      setCallTestResults([]);
      return;
    }
    let cancelled = false;
    setCallTestSearching(true);
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .or(`display_name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      if (!cancelled) {
        setCallTestResults((data || []) as any);
        setCallTestSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [callTestQuery]);

  const sendTestCall = async () => {
    if (!callTestTarget) return;
    setCallTestSending(true);
    setCallTestResult(null);
    setCallTestError(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-test-call-push", {
        body: { target_user_id: callTestTarget.id },
      });
      if (error) {
        setCallTestError(`Invoke error: ${error.message}`);
        toast.error(error.message);
      } else {
        setCallTestResult(data);
        const tokens = (data as any)?.tokens_on_file ?? 0;
        const sent = (data as any)?.sent ?? 0;
        if (tokens === 0) {
          toast.warning("No FCM tokens on file — user must open the native app while signed in");
        } else if (sent > 0) {
          toast.success(`Test call dispatched to ${sent}/${tokens} device(s)`);
        } else {
          toast.error("FCM rejected every token — see per-token diagnostics");
        }
      }
    } catch (e) {
      setCallTestError(`Error: ${(e as Error).message}`);
      toast.error((e as Error).message);
    } finally {
      setCallTestSending(false);
    }
  };


  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("*")
        .limit(1)
        .single();
      if (data) {
        const d = data as any;
        setPredictionFee(String(d.prediction_fee_percent ?? 10));
        // admin_fee_percent no longer used in UI
        setCreatorFee(String(d.creator_fee_percent));
        setCreatorFeeBlue(String(d.creator_fee_blue_percent ?? d.creator_fee_percent ?? 3));
        setCreatorFeeGold(String(d.creator_fee_gold_percent ?? d.creator_fee_percent ?? 3));
        setReferrerCommission(String(d.referrer_commission_percent ?? 0));
        setReferralReward(String(d.referral_reward_amount ?? 5));
        setMinTokenBalance(String(d.min_token_balance ?? 10000000));
        setMinGoldTokenBalance(String(d.min_gold_token_balance ?? 100000000));
        setMinNftBalance(String(d.min_nft_balance ?? 1));
        setMinWithdrawalAmount(String(d.min_withdrawal_amount ?? 5));
        setWithdrawalCooldown(String(d.withdrawal_cooldown_minutes ?? 5));
        setWithdrawalMultiplier(String(d.withdrawal_multiplier ?? 2));
        setKycTier1DailyLimit(String(d.kyc_tier1_daily_limit ?? 500));
        setKycTier2DailyLimit(String(d.kyc_tier2_daily_limit ?? 50000));
        setMaxDailyWithdrawals(String(d.max_daily_withdrawals ?? 5));
        setWithdrawalLimitEnabled(d.withdrawal_limit_enabled !== false);
        setExitFee(String(d.exit_fee_percent ?? 5));
        setLiquidityReturnFee(String((d as any).liquidity_return_fee_percent ?? 5));
        setMinLiquidity(String((d as any).min_liquidity ?? 10));
        setWithdrawalFee(String(d.withdrawal_fee_percent ?? 0));
        setCopyTradeCommission(String(d.copy_trade_commission_percent ?? 10));
        setQuickTradeFee(String(d.quick_trade_fee_percent ?? 5));
        setQtMinBet(String(d.qt_min_bet ?? 1));
        setQtMaxBet(String(d.qt_max_bet ?? 500));
        setQtStreak2(String(d.qt_streak_2x ?? 1.05));
        setQtStreak3(String(d.qt_streak_3x ?? 1.10));
        setQtStreak4(String(d.qt_streak_4x ?? 1.15));
        setQtStreak5(String(d.qt_streak_5x ?? 1.25));
        const assets = String(d.qt_enabled_assets ?? "BTC,ETH,BNB,SOL,XRP,DOGE");
        setQtEnabledAssets(new Set(assets.split(",").filter(Boolean)));
        const disabledAssets = String(d.qt_disabled_assets ?? "");
        setQtDisabledAssets(new Set(disabledAssets.split(",").filter(Boolean)));
        const timeframes = String(d.qt_enabled_timeframes ?? "60,180,300,900");
        setQtEnabledTimeframes(new Set(timeframes.split(",").filter(Boolean).map(Number)));
        setBlueRevenueShare(String(d.blue_revenue_share_percent ?? 0));
        setGoldRevenueShare(String(d.gold_revenue_share_percent ?? 0));
        setBlueTrendingMult(String(d.blue_trending_multiplier ?? 1.2));
        setGoldTrendingMult(String(d.gold_trending_multiplier ?? 1.5));
        setBlueMaxFreeMarkets(String(d.blue_max_free_markets ?? 5));
        setGoldMaxFreeMarkets(String(d.gold_max_free_markets ?? 20));
        setAiGenerationCost(String(d.ai_generation_cost ?? 0.5));
        setAutoResolveFee(String(d.auto_resolve_fee ?? 0));
        setPayazaMode(d.payaza_mode === "checkout_sdk" ? "checkout_sdk" : "direct_api");
        setQtOneSidedBonus(d.qt_one_sided_bonus !== false);
        setBoostFlashPrice(String(d.boost_flash_price ?? 20));
        setBoostStandardPrice(String(d.boost_standard_price ?? 50));
        setBoostWhalePrice(String(d.boost_whale_price ?? 150));
        setBroadcastPrice(String(d.broadcast_price ?? 5));
        setBc400PoolPercent(String(d.bc400_pool_percent ?? 0));
        setOsureEnabled(d.osure_enabled !== false);
        setOsure25Premium(String(d.osure_25_premium ?? 10));
        setOsure50Premium(String(d.osure_50_premium ?? 20));
        setOsure100Premium(String(d.osure_100_premium ?? 30));
        setWelcomeBonusPercent(String(d.welcome_bonus_percent ?? 0));
        setWelcomeBonusCap(String(d.welcome_bonus_cap ?? 0));
        setGiftFeePercent(String(d.gift_fee_percent ?? 2));
        setPredictionMinBet(String(d.prediction_min_bet ?? 1));
        setPredictionMaxBet(String(d.prediction_max_bet ?? 10000));
        setDepositMinAmount(String(d.deposit_min_amount ?? 1));
        setDepositMaxAmount(String(d.deposit_max_amount ?? 50000));
        setPushPromptCooldownDays(String(d.push_prompt_cooldown_days ?? 14));
        setDepositExpiryMinutes(String(d.deposit_expiry_minutes ?? 60));
        setMaxDraftsNone(String((d as any).max_drafts_none ?? 2));
        setMaxDraftsBlue(String((d as any).max_drafts_blue ?? 5));
        setMaxDraftsGold(String((d as any).max_drafts_gold ?? 10));
        setSettingsId(d.id);
      }
      if (error) console.error(error);
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const predictionFeeNum = parseFloat(predictionFee) || 0;
  // Platform keeps remainder — no adminNum needed
  const creatorNum = parseFloat(creatorFee) || 0;
  const creatorBlueNum = parseFloat(creatorFeeBlue) || 0;
  const creatorGoldNum = parseFloat(creatorFeeGold) || 0;
  const referrerCommissionNum = parseFloat(referrerCommission) || 0;
  const referralNum = parseFloat(referralReward) || 0;
  const tokenNum = parseFloat(minTokenBalance) || 0;
  const goldTokenNum = parseFloat(minGoldTokenBalance) || 0;
  const nftNum = parseInt(minNftBalance) || 0;
  const minWithdrawNum = parseFloat(minWithdrawalAmount) || 0;
  const withdrawalCooldownNum = parseInt(withdrawalCooldown) || 5;
  const withdrawalMultiplierNum = parseFloat(withdrawalMultiplier) || 2;
  const kycTier1DailyLimitNum = parseFloat(kycTier1DailyLimit) || 500;
  const kycTier2DailyLimitNum = parseFloat(kycTier2DailyLimit) || 50000;
  const maxDailyWithdrawalsNum = parseInt(maxDailyWithdrawals) || 5;
  const exitFeeNum = parseFloat(exitFee) || 0;
  const liquidityReturnFeeNum = parseFloat(liquidityReturnFee) || 5;
  const minLiquidityNum = parseFloat(minLiquidity) || 10;
  const withdrawalFeeNum = parseFloat(withdrawalFee) || 0;
  const copyTradeCommissionNum = parseFloat(copyTradeCommission) || 0;
  const quickTradeFeeNum = parseFloat(quickTradeFee) || 0;
  const qtMinBetNum = parseFloat(qtMinBet) || 0;
  const qtMaxBetNum = parseFloat(qtMaxBet) || 0;
  const qtStreak2Num = parseFloat(qtStreak2) || 1;
  const qtStreak3Num = parseFloat(qtStreak3) || 1;
  const qtStreak4Num = parseFloat(qtStreak4) || 1;
  const qtStreak5Num = parseFloat(qtStreak5) || 1;
  const blueRevenueShareNum = parseFloat(blueRevenueShare) || 0;
  const goldRevenueShareNum = parseFloat(goldRevenueShare) || 0;
  const blueTrendingMultNum = parseFloat(blueTrendingMult) || 1.2;
  const goldTrendingMultNum = parseFloat(goldTrendingMult) || 1.5;
  const blueMaxFreeMarketsNum = parseInt(blueMaxFreeMarkets) || 5;
  const goldMaxFreeMarketsNum = parseInt(goldMaxFreeMarkets) || 20;
  const aiGenerationCostNum = parseFloat(aiGenerationCost) || 0;
  const autoResolveFeeNum = parseFloat(autoResolveFee) || 0;
  const boostFlashPriceNum = parseFloat(boostFlashPrice) || 20;
  const boostStandardPriceNum = parseFloat(boostStandardPrice) || 50;
  const boostWhalePriceNum = parseFloat(boostWhalePrice) || 150;
  const broadcastPriceNum = parseFloat(broadcastPrice) || 5;
  const bc400PoolPercentNum = parseFloat(bc400PoolPercent) || 0;
  const osure25PremiumNum = parseFloat(osure25Premium) || 10;
  const osure50PremiumNum = parseFloat(osure50Premium) || 20;
  const osure100PremiumNum = parseFloat(osure100Premium) || 30;
  const welcomeBonusPercentNum = parseFloat(welcomeBonusPercent) || 0;
  const welcomeBonusCapNum = parseFloat(welcomeBonusCap) || 0;
  const giftFeePercentNum = parseFloat(giftFeePercent) || 2;
  const predictionMinBetNum = parseFloat(predictionMinBet) || 1;
  const predictionMaxBetNum = parseFloat(predictionMaxBet) || 10000;
  const depositMinAmountNum = parseFloat(depositMinAmount) || 1;
  const depositMaxAmountNum = parseFloat(depositMaxAmount) || 50000;
  const pushPromptCooldownDaysNum = parseInt(pushPromptCooldownDays) || 14;
  const depositExpiryMinutesNum = parseInt(depositExpiryMinutes) || 60;

  // Splits must sum to ≤ 100 — platform keeps the remainder
  const splitTotalGold = creatorGoldNum + referrerCommissionNum + bc400PoolPercentNum;
  const splitTotalBlue = creatorBlueNum + referrerCommissionNum + bc400PoolPercentNum;
  const splitTotalUnverified = creatorNum + referrerCommissionNum + bc400PoolPercentNum;
  const platformNetGold = 100 - splitTotalGold;
  const platformNetBlue = 100 - splitTotalBlue;
  const platformNetUnverified = 100 - splitTotalUnverified;
  const splitsValid = splitTotalGold <= 100 && splitTotalBlue <= 100 && splitTotalUnverified <= 100;
  const isValid =
    predictionFeeNum >= 0 && predictionFeeNum <= 100 &&
    referrerCommissionNum >= 0 && bc400PoolPercentNum >= 0 &&
    creatorNum >= 0 && creatorBlueNum >= 0 && creatorGoldNum >= 0 &&
    splitsValid &&
    referralNum >= 0 && tokenNum >= 0 && nftNum >= 0 &&
    minWithdrawNum >= 0 && withdrawalCooldownNum >= 0 && withdrawalMultiplierNum >= 1 && exitFeeNum >= 0 && exitFeeNum <= 100 && liquidityReturnFeeNum >= 0 && liquidityReturnFeeNum <= 100 && withdrawalFeeNum >= 0 && withdrawalFeeNum <= 100 && copyTradeCommissionNum >= 0 && copyTradeCommissionNum <= 100 &&
    quickTradeFeeNum >= 0 && quickTradeFeeNum <= 100 &&
    qtMinBetNum >= 0 && qtMaxBetNum > 0 && qtMaxBetNum >= qtMinBetNum &&
    qtStreak2Num >= 1 && qtStreak3Num >= 1 && qtStreak4Num >= 1 && qtStreak5Num >= 1 &&
    qtEnabledAssets.size > 0 && qtEnabledTimeframes.size > 0;

  const toggleTimeframe = (seconds: number) => {
    setQtEnabledTimeframes(prev => {
      const next = new Set(prev);
      if (next.has(seconds)) {
        if (next.size <= 1) return next;
        next.delete(seconds);
      } else {
        next.add(seconds);
      }
      return next;
    });
  };

  const toggleAsset = (symbol: string) => {
    setQtEnabledAssets(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        if (next.size <= 1) return next; // keep at least one
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!isValid || !settingsId) {
      if (!settingsId) toast.error("Settings not loaded. Please refresh.");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("commission_settings")
        .update({
          prediction_fee_percent: predictionFeeNum,
          // admin_fee_percent left unchanged in DB
          creator_fee_percent: creatorNum,
          creator_fee_blue_percent: creatorBlueNum,
          creator_fee_gold_percent: creatorGoldNum,
          referrer_commission_percent: referrerCommissionNum,
          referral_reward_amount: referralNum,
          min_token_balance: tokenNum,
          min_gold_token_balance: goldTokenNum,
          min_nft_balance: nftNum,
          min_withdrawal_amount: minWithdrawNum,
          withdrawal_cooldown_minutes: withdrawalCooldownNum,
          withdrawal_multiplier: withdrawalMultiplierNum,
           withdrawal_limit_enabled: withdrawalLimitEnabled,
           kyc_tier1_daily_limit: kycTier1DailyLimitNum,
           kyc_tier2_daily_limit: kycTier2DailyLimitNum,
           max_daily_withdrawals: maxDailyWithdrawalsNum,
            exit_fee_percent: exitFeeNum,
           liquidity_return_fee_percent: liquidityReturnFeeNum,
           min_liquidity: minLiquidityNum,
           withdrawal_fee_percent: withdrawalFeeNum,
          copy_trade_commission_percent: copyTradeCommissionNum,
          quick_trade_fee_percent: quickTradeFeeNum,
          qt_min_bet: qtMinBetNum,
          qt_max_bet: qtMaxBetNum,
          qt_streak_2x: qtStreak2Num,
          qt_streak_3x: qtStreak3Num,
          qt_streak_4x: qtStreak4Num,
          qt_streak_5x: qtStreak5Num,
           qt_enabled_assets: Array.from(qtEnabledAssets).join(","),
           qt_disabled_assets: Array.from(qtDisabledAssets).join(","),
           qt_enabled_timeframes: Array.from(qtEnabledTimeframes).join(","),
           blue_revenue_share_percent: blueRevenueShareNum,
           gold_revenue_share_percent: goldRevenueShareNum,
           blue_trending_multiplier: blueTrendingMultNum,
           gold_trending_multiplier: goldTrendingMultNum,
           blue_max_free_markets: blueMaxFreeMarketsNum,
            gold_max_free_markets: goldMaxFreeMarketsNum,
              ai_generation_cost: aiGenerationCostNum,
              auto_resolve_fee: autoResolveFeeNum,
               payaza_mode: payazaMode,
               qt_one_sided_bonus: qtOneSidedBonus,
               boost_flash_price: boostFlashPriceNum,
               boost_standard_price: boostStandardPriceNum,
                boost_whale_price: boostWhalePriceNum,
                broadcast_price: broadcastPriceNum,
                 bc400_pool_percent: bc400PoolPercentNum,
                 osure_enabled: osureEnabled,
                  osure_25_premium: osure25PremiumNum,
                  osure_50_premium: osure50PremiumNum,
                  osure_100_premium: osure100PremiumNum,
                   welcome_bonus_percent: welcomeBonusPercentNum,
                   welcome_bonus_cap: welcomeBonusCapNum,
                    gift_fee_percent: giftFeePercentNum,
                    prediction_min_bet: predictionMinBetNum,
                    prediction_max_bet: predictionMaxBetNum,
                    deposit_min_amount: depositMinAmountNum,
                    deposit_max_amount: depositMaxAmountNum,
                    push_prompt_cooldown_days: pushPromptCooldownDaysNum,
                    deposit_expiry_minutes: depositExpiryMinutesNum,
                    max_drafts_none: parseInt(maxDraftsNone) || 2,
                    max_drafts_blue: parseInt(maxDraftsBlue) || 5,
                    max_drafts_gold: parseInt(maxDraftsGold) || 10,
             updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        } as any)
        .eq("id", settingsId);
      if (error) throw error;

      // Audit log
      const { logAuditEvent } = await import("@/lib/auditLog");
      logAuditEvent({
        action: "settings_updated",
        targetId: settingsId,
        targetType: "commission_settings",
        details: {
          prediction_fee_percent: predictionFeeNum,
          // admin_fee_percent: remainder (not configurable)
          creator_fee_percent: creatorNum,
          creator_fee_blue_percent: creatorBlueNum,
          creator_fee_gold_percent: creatorGoldNum,
          referrer_commission_percent: referrerCommissionNum,
           exit_fee_percent: exitFeeNum,
           liquidity_return_fee_percent: liquidityReturnFeeNum,
           min_liquidity: minLiquidityNum,
           withdrawal_fee_percent: withdrawalFeeNum,
          copy_trade_commission_percent: copyTradeCommissionNum,
          min_withdrawal_amount: minWithdrawNum,
          withdrawal_cooldown_minutes: withdrawalCooldownNum,
          withdrawal_multiplier: withdrawalMultiplierNum,
          withdrawal_limit_enabled: withdrawalLimitEnabled,
          referral_reward_amount: referralNum,
          quick_trade_fee_percent: quickTradeFeeNum,
          qt_min_bet: qtMinBetNum,
          qt_max_bet: qtMaxBetNum,
          qt_streak_2x: qtStreak2Num,
          qt_streak_3x: qtStreak3Num,
          qt_streak_4x: qtStreak4Num,
          qt_streak_5x: qtStreak5Num,
           min_token_balance: tokenNum,
           min_gold_token_balance: goldTokenNum,
           min_nft_balance: nftNum,
          blue_revenue_share_percent: blueRevenueShareNum,
          gold_revenue_share_percent: goldRevenueShareNum,
          blue_trending_multiplier: blueTrendingMultNum,
           gold_trending_multiplier: goldTrendingMultNum,
           blue_max_free_markets: blueMaxFreeMarketsNum,
            gold_max_free_markets: goldMaxFreeMarketsNum,
               ai_generation_cost: aiGenerationCostNum,
               auto_resolve_fee: autoResolveFeeNum,
               payaza_mode: payazaMode,
                qt_one_sided_bonus: qtOneSidedBonus,
                 bc400_pool_percent: bc400PoolPercentNum,
                  welcome_bonus_percent: welcomeBonusPercentNum,
                  welcome_bonus_cap: welcomeBonusCapNum,
                  gift_fee_percent: giftFeePercentNum,
        },
      });

      toast.success("Settings saved successfully");
    } catch (err: any) {
      console.error("Save settings error:", err);
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Admin-only view: show just import presets
  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Auto-Import Settings</h1>
        <PolymarketPresetsSection canEdit={canEdit} />
        <SportsImportPresetsSection canEdit={canEdit} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Platform Settings</h1>
        <Button onClick={handleSave} disabled={!isValid || saving || !canEdit} size="sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {canEdit ? "Save All Settings" : "View Only"}
        </Button>
      </div>

      {/* ─── Feature Toggles (always visible) ─── */}
      <FeatureTogglesCard />

      {/* ─── FCM Push Diagnostics (super admin, always visible) ─── */}
      {isSuperAdmin && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> FCM Push Diagnostics
            </CardTitle>
            <CardDescription className="text-xs">
              Verify FCM HTTP v1 credentials (service account + project ID) and optionally dry-run a send against a device token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="fcmTestToken" className="text-xs">Device FCM Token (optional)</Label>
              <Input
                id="fcmTestToken"
                placeholder="Paste a device FCM token to dry-run send"
                value={fcmTestToken}
                onChange={(e) => setFcmTestToken(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Leave empty to only verify credentials and OAuth2 token. With a token, a <code>validate_only</code> request is sent — no actual notification is delivered.
              </p>
            </div>
            <Button onClick={runFcmTest} disabled={fcmTesting} size="sm">
              {fcmTesting ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Zap className="w-3 h-3 mr-2" />}
              Run FCM Test
            </Button>
            {fcmTestResult && (
              <pre className="text-[10px] bg-muted p-3 rounded overflow-auto max-h-80 whitespace-pre-wrap break-all">
                {fcmTestResult}
              </pre>
            )}

            {/* ─── Test Incoming Call ─── */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs font-semibold">Test Incoming Call Push</p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Sends a real <code>is_call: true</code> FCM payload to a selected user. Their native app should ring with the full-screen incoming-call UI.
              </p>

              {!callTestTarget ? (
                <>
                  <Input
                    placeholder="Search by name, username, or email…"
                    value={callTestQuery}
                    onChange={(e) => setCallTestQuery(e.target.value)}
                    className="text-xs"
                  />
                  {callTestSearching && (
                    <p className="text-[10px] text-muted-foreground">Searching…</p>
                  )}
                  {callTestResults.length > 0 && (
                    <div className="border border-border rounded-md max-h-48 overflow-auto divide-y divide-border">
                      {callTestResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setCallTestTarget(u);
                            setCallTestQuery("");
                            setCallTestResults([]);
                          }}
                          className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                        >
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-muted" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {u.display_name || "Unnamed"}
                            </p>
                            {u.username && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                @{u.username}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between gap-2 p-2 border border-border rounded-md">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {callTestTarget.display_name || "Unnamed"}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {callTestTarget.id}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCallTestTarget(null);
                      setCallTestResult(null);
                    }}
                  >
                    Change
                  </Button>
                </div>
              )}

              <Button
                onClick={sendTestCall}
                disabled={!callTestTarget || callTestSending}
                size="sm"
                className="w-full"
              >
                {callTestSending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Ringing…
                  </>
                ) : (
                  <>
                    <Phone className="w-3 h-3 mr-2" />
                    Send Test Incoming Call
                  </>
                )}
              </Button>

              {callTestResult && (
                <pre className="text-[10px] bg-muted p-3 rounded overflow-auto max-h-60 whitespace-pre-wrap break-all">
                  {callTestResult}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Onboarding Reset (super admin) ─── */}
      {isSuperAdmin && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Onboarding Flow
            </CardTitle>
            <CardDescription className="text-xs">
              Reset the first-run welcome carousel for this device. Next reload will route to <code>/welcome</code>.
              Current state: <strong>{hasCompletedOnboarding() ? "Onboarded" : "First-run"}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  resetOnboarding();
                  toast.success("Onboarding reset — reload to see /welcome");
                }}
              >
                <RefreshCw className="w-3 h-3 mr-2" /> Reset Onboarding
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open("/welcome", "_blank")}
              >
                Preview Welcome
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="fees" className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="fees" className="flex-1 min-w-[100px] text-xs sm:text-sm gap-1.5">
            <Percent className="w-3.5 h-3.5 hidden sm:inline" /> Fees
          </TabsTrigger>
          <TabsTrigger value="quicktrade" className="flex-1 min-w-[100px] text-xs sm:text-sm gap-1.5">
            <Zap className="w-3.5 h-3.5 hidden sm:inline" /> Quick Trade
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="flex-1 min-w-[100px] text-xs sm:text-sm gap-1.5">
            <ArrowUpFromLine className="w-3.5 h-3.5 hidden sm:inline" /> Withdrawals
          </TabsTrigger>
          <TabsTrigger value="creators" className="flex-1 min-w-[100px] text-xs sm:text-sm gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 hidden sm:inline" /> Creators
          </TabsTrigger>
          <TabsTrigger value="promotions" className="flex-1 min-w-[100px] text-xs sm:text-sm gap-1.5">
            <Sparkles className="w-3.5 h-3.5 hidden sm:inline" /> Promotions
          </TabsTrigger>
          <TabsTrigger value="osure" className="flex-1 min-w-[100px] text-xs sm:text-sm gap-1.5">
            <Shield className="w-3.5 h-3.5 hidden sm:inline" /> oSURE
          </TabsTrigger>
        </TabsList>

        {/* ═══════ FEES TAB ═══════ */}
        <TabsContent value="fees" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Prediction Fee */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary" /> Market Prediction Fee
                </CardTitle>
                <CardDescription className="text-xs">
                  Flat fee charged on each prediction, then split internally.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="predictionFee" className="text-sm font-semibold">Prediction Fee (%)</Label>
                  <Input id="predictionFee" type="number" min={0} max={100} step={0.5} value={predictionFee} onChange={(e) => setPredictionFee(e.target.value)} placeholder="10" />
                  <p className="text-[10px] text-muted-foreground">Flat fee deducted from each prediction wager. All goes to admin pool reserve first.</p>
                </div>

                <div className="border-t border-border pt-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">Creator Splits (from the fee)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="creatorFee" className="text-xs">Unverified (%)</Label>
                      <Input id="creatorFee" type="number" min={0} max={100} step={0.1} value={creatorFee} onChange={(e) => setCreatorFee(e.target.value)} placeholder="30" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="creatorFeeBlue" className="text-xs">Blue Tick (%)</Label>
                      <Input id="creatorFeeBlue" type="number" min={0} max={100} step={0.1} value={creatorFeeBlue} onChange={(e) => setCreatorFeeBlue(e.target.value)} placeholder="30" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="creatorFeeGold" className="text-xs">Gold Tick (%)</Label>
                      <Input id="creatorFeeGold" type="number" min={0} max={100} step={0.1} value={creatorFeeGold} onChange={(e) => setCreatorFeeGold(e.target.value)} placeholder="30" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="referrerCommission" className="text-xs">Referrer Split (%)</Label>
                    <Input id="referrerCommission" type="number" min={0} max={100} step={0.1} value={referrerCommission} onChange={(e) => setReferrerCommission(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc400PoolPercent" className="text-xs">BC400 Pool Split (%)</Label>
                    <Input id="bc400PoolPercent" type="number" min={0} max={100} step={0.1} value={bc400PoolPercent} onChange={(e) => setBc400PoolPercent(e.target.value)} placeholder="0" />
                  </div>
                </div>

                {splitTotalGold > 100 && <p className="text-xs text-destructive">Internal splits cannot exceed 100%.</p>}
              </CardContent>
            </Card>

            {/* Fee Summary */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" /> Fee Summary
                </CardTitle>
                <CardDescription className="text-xs">Per $100 prediction breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Stage 1 — At Trade Time</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Prediction Fee ({predictionFeeNum}%)</span>
                    <span className="font-bold text-primary">${predictionFeeNum.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Market Liquidity Pool</span>
                    <span className="font-bold text-primary">${(100 - predictionFeeNum).toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-border pt-2 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Stage 2 — After 48h (from ${predictionFeeNum.toFixed(2)})</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Creator (Gold {creatorGoldNum}%)</span>
                    <span className="font-medium">${(predictionFeeNum * creatorGoldNum / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Creator (Blue {creatorBlueNum}%)</span>
                    <span className="font-medium">${(predictionFeeNum * creatorBlueNum / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Creator (Unverified {creatorNum}%)</span>
                    <span className="font-medium">${(predictionFeeNum * creatorNum / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Referrer ({referrerCommissionNum}%)</span>
                    <span className="font-medium">${(predictionFeeNum * referrerCommissionNum / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">BC400 Pool ({bc400PoolPercentNum}%)</span>
                    <span className="font-medium">${(predictionFeeNum * bc400PoolPercentNum / 100).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-border pt-1.5 mt-1.5">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-muted-foreground">Platform Keeps</span>
                      <span className="text-primary">{platformNetGold.toFixed(1)}% = ${(predictionFeeNum * platformNetGold / 100).toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Gold shown. Blue: {platformNetBlue.toFixed(1)}% | Unverified: {platformNetUnverified.toFixed(1)}%</p>
                    <div className="flex justify-between text-xs font-semibold mt-1 pt-1 border-t border-dashed border-border">
                      <span className="text-muted-foreground">Total</span>
                      <span className="text-foreground">100%</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-2 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Early Exit Fee</span>
                     <span className="font-medium">{exitFeeNum}%</span>
                   </div>
                   <div className="flex justify-between text-xs">
                     <span className="text-muted-foreground">Liquidity Return Fee</span>
                     <span className="font-medium">{liquidityReturnFeeNum}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Copy Trade Commission</span>
                    <span className="font-medium">{copyTradeCommissionNum}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Other fees in a row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><LogOut className="w-4 h-4" /> Early Exit Fee</CardTitle>
                <CardDescription className="text-[10px]">Fee when users sell positions early.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label htmlFor="exitFee" className="text-xs">Exit Fee (%)</Label>
                  <Input id="exitFee" type="number" min={0} max={100} step={0.5} value={exitFee} onChange={(e) => setExitFee(e.target.value)} placeholder="5" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><LogOut className="w-4 h-4" /> Liquidity Return Fee</CardTitle>
                <CardDescription className="text-[10px]">Fee deducted from creator's liquidity before it is returned upon market resolution.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label htmlFor="liquidityReturnFee" className="text-xs">Liquidity Return Fee (%)</Label>
                  <Input id="liquidityReturnFee" type="number" min={0} max={100} step={0.5} value={liquidityReturnFee} onChange={(e) => setLiquidityReturnFee(e.target.value)} placeholder="5" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Droplets className="w-4 h-4" /> Minimum Liquidity</CardTitle>
                <CardDescription className="text-[10px]">Minimum amount of USDT a creator must add as initial liquidity when creating a market.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label htmlFor="minLiquidity" className="text-xs">Minimum Liquidity (USDT)</Label>
                  <Input id="minLiquidity" type="number" min={1} step={1} value={minLiquidity} onChange={(e) => setMinLiquidity(e.target.value)} placeholder="10" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Copy className="w-4 h-4" /> Copy Trade Commission</CardTitle>
                <CardDescription className="text-[10px]">% of profit from copiers to original trader.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label htmlFor="copyTradeCommission" className="text-xs">Commission (%)</Label>
                  <Input id="copyTradeCommission" type="number" min={0} max={100} step={0.5} value={copyTradeCommission} onChange={(e) => setCopyTradeCommission(e.target.value)} placeholder="10" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" /> Auto-Resolve Fee</CardTitle>
                <CardDescription className="text-[10px]">Fee for creators using auto-resolve.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label htmlFor="autoResolveFee" className="text-xs">Fee ($)</Label>
                  <Input id="autoResolveFee" type="number" min={0} step={0.5} value={autoResolveFee} onChange={(e) => setAutoResolveFee(e.target.value)} placeholder="0" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ QUICK TRADE TAB ═══════ */}
        <TabsContent value="quicktrade" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Fee & Limits */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Fee & Limits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="quickTradeFee" className="text-xs">Platform Fee (%)</Label>
                  <Input id="quickTradeFee" type="number" min={0} max={100} step={0.5} value={quickTradeFee} onChange={(e) => setQuickTradeFee(e.target.value)} placeholder="5" />
                  <p className="text-[10px] text-muted-foreground">Deducted from losing pool before distributing to winners</p>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <Gift className="w-4 h-4 text-primary" /> One-Sided Bonus
                    </Label>
                    <p className="text-[10px] text-muted-foreground">No fee + 0.5% bonus when all bets are on the winning side</p>
                  </div>
                  <Switch checked={qtOneSidedBonus} onCheckedChange={setQtOneSidedBonus} />
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Trade Limits</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="qtMinBet" className="text-xs">Min Trade ($)</Label>
                      <Input id="qtMinBet" type="number" min={0} step={1} value={qtMinBet} onChange={(e) => setQtMinBet(e.target.value)} placeholder="1" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="qtMaxBet" className="text-xs">Max Trade ($)</Label>
                      <Input id="qtMaxBet" type="number" min={1} step={1} value={qtMaxBet} onChange={(e) => setQtMaxBet(e.target.value)} placeholder="500" />
                    </div>
                  </div>
                  {qtMaxBetNum < qtMinBetNum && <p className="text-[10px] text-destructive mt-1">Max trade must be ≥ min trade.</p>}
                </div>
              </CardContent>
            </Card>

            {/* Streak Multipliers */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="w-4 h-4 text-primary" /> Streak Multipliers
                </CardTitle>
                <CardDescription className="text-xs">Bonus multipliers for consecutive win streaks.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">2 Wins (×)</Label>
                    <Input type="number" min={1} max={5} step={0.01} value={qtStreak2} onChange={(e) => setQtStreak2(e.target.value)} placeholder="1.05" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">3 Wins (×)</Label>
                    <Input type="number" min={1} max={5} step={0.01} value={qtStreak3} onChange={(e) => setQtStreak3(e.target.value)} placeholder="1.10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">4 Wins (×)</Label>
                    <Input type="number" min={1} max={5} step={0.01} value={qtStreak4} onChange={(e) => setQtStreak4(e.target.value)} placeholder="1.15" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">5+ Wins (×)</Label>
                    <Input type="number" min={1} max={5} step={0.01} value={qtStreak5} onChange={(e) => setQtStreak5(e.target.value)} placeholder="1.25" />
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">Preview</p>
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">2 wins → ×{qtStreak2Num.toFixed(2)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">3 wins → ×{qtStreak3Num.toFixed(2)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">4 wins → ×{qtStreak4Num.toFixed(2)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">5+ wins → ×{qtStreak5Num.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Assets & Timeframes */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Available Assets
                </CardTitle>
                <CardDescription className="text-xs">Toggle which assets are available. At least one must be enabled.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                  {ALL_ASSETS.map(asset => (
                    <div key={asset.symbol} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium">{asset.symbol}</span>
                        <span className="text-xs text-muted-foreground truncate">{asset.label}</span>
                        {qtDisabledAssets.has(asset.symbol) && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">⚠️</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {qtDisabledAssets.has(asset.symbol) && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => {
                            setQtDisabledAssets(prev => { const next = new Set(prev); next.delete(asset.symbol); return next; });
                          }}>
                            <RefreshCw className="w-3 h-3 mr-1" /> Re-enable
                          </Button>
                        )}
                        <Switch
                          checked={qtEnabledAssets.has(asset.symbol)}
                          onCheckedChange={() => toggleAsset(asset.symbol)}
                          disabled={qtEnabledAssets.has(asset.symbol) && qtEnabledAssets.size <= 1}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {qtDisabledAssets.size > 0 && (
                  <div className="mt-3 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                    <p className="text-[11px] text-destructive font-medium">⚠️ {qtDisabledAssets.size} asset(s) auto-disabled due to API errors.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Timer className="w-4 h-4 text-primary" /> Round Durations
                </CardTitle>
                <CardDescription className="text-xs">Toggle available round durations. At least one required.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ALL_TIMEFRAMES.map(tf => (
                    <div key={tf.seconds} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <span className="text-sm font-medium">{tf.label}</span>
                      <Switch
                        checked={qtEnabledTimeframes.has(tf.seconds)}
                        onCheckedChange={() => toggleTimeframe(tf.seconds)}
                        disabled={qtEnabledTimeframes.has(tf.seconds) && qtEnabledTimeframes.size <= 1}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ WITHDRAWALS TAB ═══════ */}
        <TabsContent value="withdrawals" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" /> Referral Reward
                </CardTitle>
                <CardDescription className="text-xs">Fixed amount credited to referrer's bonus balance on first prediction by referral.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="referralReward" className="text-xs">Reward Amount ($)</Label>
                  <Input id="referralReward" type="number" min={0} step={0.5} value={referralReward} onChange={(e) => setReferralReward(e.target.value)} placeholder="5" />
                  {referralNum < 0 && <p className="text-xs text-destructive">Cannot be negative.</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUpFromLine className="w-4 h-4 text-primary" /> Withdrawal Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="withdrawalFee" className="text-xs">Withdrawal Fee (%)</Label>
                    <Input id="withdrawalFee" type="number" min={0} max={100} step={0.5} value={withdrawalFee} onChange={(e) => setWithdrawalFee(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="minWithdrawalAmount" className="text-xs">Minimum ($)</Label>
                    <Input id="minWithdrawalAmount" type="number" min={0} step={1} value={minWithdrawalAmount} onChange={(e) => setMinWithdrawalAmount(e.target.value)} placeholder="5" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="withdrawalCooldown" className="text-xs">Cooldown (minutes)</Label>
                  <Input id="withdrawalCooldown" type="number" min={0} step={1} value={withdrawalCooldown} onChange={(e) => setWithdrawalCooldown(e.target.value)} placeholder="5" />
                  <p className="text-[10px] text-muted-foreground">Current: {withdrawalCooldownNum} min. Set 0 to disable.</p>
                </div>

                <div className="border-t border-border pt-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">KYC Daily Limits</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="kycTier1DailyLimit" className="text-xs">Tier 1 Daily ($)</Label>
                      <Input id="kycTier1DailyLimit" type="number" min={0} step={50} value={kycTier1DailyLimit} onChange={(e) => setKycTier1DailyLimit(e.target.value)} placeholder="500" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="kycTier2DailyLimit" className="text-xs">Tier 2 Daily ($)</Label>
                      <Input id="kycTier2DailyLimit" type="number" min={0} step={1000} value={kycTier2DailyLimit} onChange={(e) => setKycTier2DailyLimit(e.target.value)} placeholder="50000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="maxDailyWithdrawals" className="text-xs">Max per Day (#)</Label>
                      <Input id="maxDailyWithdrawals" type="number" min={1} step={1} value={maxDailyWithdrawals} onChange={(e) => setMaxDailyWithdrawals(e.target.value)} placeholder="5" />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Tier 1 (Basic KYC): ${kycTier1DailyLimitNum}/day · Tier 2 (Full KYC): ${kycTier2DailyLimitNum}/day · Max {maxDailyWithdrawalsNum} transactions/day</p>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-border pt-3">
                  <div>
                    <Label className="text-sm font-medium">Withdrawal Limit</Label>
                    <p className="text-[10px] text-muted-foreground">Max {withdrawalMultiplierNum}× deposits when enabled.</p>
                  </div>
                  <Switch checked={withdrawalLimitEnabled} onCheckedChange={setWithdrawalLimitEnabled} />
                </div>
                {withdrawalLimitEnabled && (
                  <div className="space-y-1.5">
                    <Label htmlFor="withdrawalMultiplier" className="text-xs">Multiplier (×deposits)</Label>
                    <Input id="withdrawalMultiplier" type="number" min={1} step={0.5} value={withdrawalMultiplier} onChange={(e) => setWithdrawalMultiplier(e.target.value)} placeholder="2" />
                    {withdrawalMultiplierNum < 1 && <p className="text-xs text-destructive">Must be at least 1×.</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ CREATORS TAB ═══════ */}
        <TabsContent value="creators" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Creator Gate Thresholds */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Coins className="w-4 h-4 text-primary" /> Creator Gate Thresholds
                </CardTitle>
                <CardDescription className="text-xs">Min BC400 token and NFT holdings to create markets.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="minTokenBalance" className="text-xs">Min BC400 (Blue)</Label>
                    <Input id="minTokenBalance" type="number" min={0} step={1} value={minTokenBalance} onChange={(e) => setMinTokenBalance(e.target.value)} placeholder="10000000" />
                    <p className="text-[10px] text-muted-foreground">{Number(tokenNum).toLocaleString()}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="minGoldTokenBalance" className="text-xs">Min BC400 (Gold)</Label>
                    <Input id="minGoldTokenBalance" type="number" min={0} step={1} value={minGoldTokenBalance} onChange={(e) => setMinGoldTokenBalance(e.target.value)} placeholder="100000000" />
                    <p className="text-[10px] text-muted-foreground">{Number(goldTokenNum).toLocaleString()}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="minNftBalance" className="text-xs">Min NFT Count</Label>
                  <Input id="minNftBalance" type="number" min={0} step={1} value={minNftBalance} onChange={(e) => setMinNftBalance(e.target.value)} placeholder="1" />
                </div>
                <div className="pt-3 border-t border-border">
                  <p className="text-xs font-semibold mb-2">Free Market Limits</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="blueMaxFreeMarkets" className="text-xs">Blue Limit</Label>
                      <Input id="blueMaxFreeMarkets" type="number" min={1} step={1} value={blueMaxFreeMarkets} onChange={(e) => setBlueMaxFreeMarkets(e.target.value)} placeholder="5" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="goldMaxFreeMarkets" className="text-xs">Gold Limit</Label>
                      <Input id="goldMaxFreeMarkets" type="number" min={1} step={1} value={goldMaxFreeMarkets} onChange={(e) => setGoldMaxFreeMarkets(e.target.value)} placeholder="20" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Verified Member Benefits */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" /> Verified Benefits
                </CardTitle>
                <CardDescription className="text-xs">Trending multipliers and revenue share bonus for verified creators.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <BulkVerificationRefresh />

                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Trending Multiplier</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Blue (×)</Label>
                      <Input type="number" min={1} max={5} step={0.1} value={blueTrendingMult} onChange={(e) => setBlueTrendingMult(e.target.value)} placeholder="1.2" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Gold (×)</Label>
                      <Input type="number" min={1} max={5} step={0.1} value={goldTrendingMult} onChange={(e) => setGoldTrendingMult(e.target.value)} placeholder="1.5" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Creator Revenue Share Bonus</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Blue (%)</Label>
                      <Input type="number" min={0} max={100} step={0.5} value={blueRevenueShare} onChange={(e) => setBlueRevenueShare(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Gold (%)</Label>
                      <Input type="number" min={0} max={100} step={0.5} value={goldRevenueShare} onChange={(e) => setGoldRevenueShare(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 mt-2">
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-background border border-primary/30 text-primary">Blue: {blueRevenueShareNum}%</span>
                      <span className="px-1.5 py-0.5 rounded bg-background border border-accent/50 text-accent-foreground">Gold: {goldRevenueShareNum}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Extra bonus on top of the standard creator fee split. Paid from platform revenue when verified creators' markets resolve.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════ PROMOTIONS TAB ═══════ */}
        <TabsContent value="promotions" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Promotion Pricing */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Promotion Pricing
                </CardTitle>
                <CardDescription className="text-xs">Boost tiers and Broadcast alert prices.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="boostFlashPrice" className="text-xs">Flash Boost ($)</Label>
                    <Input id="boostFlashPrice" type="number" min={0} step={1} value={boostFlashPrice} onChange={(e) => setBoostFlashPrice(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="boostStandardPrice" className="text-xs">Standard Boost ($)</Label>
                    <Input id="boostStandardPrice" type="number" min={0} step={1} value={boostStandardPrice} onChange={(e) => setBoostStandardPrice(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="boostWhalePrice" className="text-xs">Whale Pin ($)</Label>
                    <Input id="boostWhalePrice" type="number" min={0} step={1} value={boostWhalePrice} onChange={(e) => setBoostWhalePrice(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="broadcastPrice" className="text-xs">Broadcast Alert ($)</Label>
                    <Input id="broadcastPrice" type="number" min={0} step={1} value={broadcastPrice} onChange={(e) => setBroadcastPrice(e.target.value)} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Flash: ${boostFlashPriceNum} · Standard: ${boostStandardPriceNum} · Whale: ${boostWhalePriceNum} · Broadcast: ${broadcastPriceNum}</p>
              </CardContent>
            </Card>

            {/* AI Generation */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> AI Generation
                </CardTitle>
                <CardDescription className="text-xs">Cost per AI generation. Toggle features in Feature Toggles above.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="aiGenerationCost" className="text-xs">Cost per Generation ($)</Label>
                  <Input id="aiGenerationCost" type="number" min={0} step={0.1} value={aiGenerationCost} onChange={(e) => setAiGenerationCost(e.target.value)} placeholder="0.50" />
                  <p className="text-[10px] text-muted-foreground">Current: ${aiGenerationCostNum.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <ul className="text-[10px] text-muted-foreground space-y-0.5 ml-3 list-disc">
                    <li>AI Generate Description</li>
                    <li>AI Generate Details</li>
                    <li>AI Generate Image</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Welcome Bonus */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" /> Welcome Bonus
                </CardTitle>
                <CardDescription className="text-xs">First deposit bonus for KYC-verified users. Enable via the "Welcome Bonus" feature toggle above.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="welcomeBonusPercent" className="text-xs">Bonus Percent (%)</Label>
                    <Input id="welcomeBonusPercent" type="number" min={0} max={100} step={1} value={welcomeBonusPercent} onChange={(e) => setWelcomeBonusPercent(e.target.value)} disabled={!canEdit} />
                    <p className="text-[10px] text-muted-foreground">% of first deposit amount</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="welcomeBonusCap" className="text-xs">Max Bonus ($)</Label>
                    <Input id="welcomeBonusCap" type="number" min={0} step={1} value={welcomeBonusCap} onChange={(e) => setWelcomeBonusCap(e.target.value)} disabled={!canEdit} />
                    <p className="text-[10px] text-muted-foreground">Capped at this amount</p>
                  </div>
                </div>
                {welcomeBonusPercentNum > 0 && welcomeBonusCapNum > 0 && (
                  <p className="text-[10px] text-muted-foreground">Example: $20 deposit → ${Math.min(20 * welcomeBonusPercentNum / 100, welcomeBonusCapNum).toFixed(2)} bonus</p>
                )}
              </CardContent>
            </Card>

            {/* Gift Fee */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" /> Gift Fee
                </CardTitle>
                <CardDescription className="text-xs">Fee charged on all emoji gift transactions (Spaces & DMs). The fee is deducted from the gift amount before crediting the recipient.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="giftFeePercent" className="text-xs">Gift Fee (%)</Label>
                  <Input id="giftFeePercent" type="number" min={0} max={100} step={0.5} value={giftFeePercent} onChange={(e) => setGiftFeePercent(e.target.value)} disabled={!canEdit} />
                  <p className="text-[10px] text-muted-foreground">Current: {giftFeePercentNum}% — e.g. $1.00 gift → recipient gets ${(1 - 1 * giftFeePercentNum / 100).toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Platform Limits */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" /> Platform Limits
                </CardTitle>
                <CardDescription className="text-xs">Dynamic min/max amounts for predictions, deposits, and other platform-wide limits.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="predictionMinBet" className="text-xs">Prediction Min Bet ($)</Label>
                    <Input id="predictionMinBet" type="number" min={0} step={1} value={predictionMinBet} onChange={(e) => setPredictionMinBet(e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="predictionMaxBet" className="text-xs">Prediction Max Bet ($)</Label>
                    <Input id="predictionMaxBet" type="number" min={1} step={100} value={predictionMaxBet} onChange={(e) => setPredictionMaxBet(e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="depositMinAmount" className="text-xs">Deposit Min ($)</Label>
                    <Input id="depositMinAmount" type="number" min={0} step={1} value={depositMinAmount} onChange={(e) => setDepositMinAmount(e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="depositMaxAmount" className="text-xs">Deposit Max ($)</Label>
                    <Input id="depositMaxAmount" type="number" min={1} step={1000} value={depositMaxAmount} onChange={(e) => setDepositMaxAmount(e.target.value)} disabled={!canEdit} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="depositExpiryMinutes" className="text-xs">Deposit Expiry (min)</Label>
                    <Input id="depositExpiryMinutes" type="number" min={5} step={5} value={depositExpiryMinutes} onChange={(e) => setDepositExpiryMinutes(e.target.value)} disabled={!canEdit} />
                    <p className="text-[10px] text-muted-foreground">Payment window timeout</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pushPromptCooldownDays" className="text-xs">Push Prompt Cooldown (days)</Label>
                    <Input id="pushPromptCooldownDays" type="number" min={1} step={1} value={pushPromptCooldownDays} onChange={(e) => setPushPromptCooldownDays(e.target.value)} disabled={!canEdit} />
                    <p className="text-[10px] text-muted-foreground">Days before re-prompting push notifications</p>
                  </div>
                </div>
                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Max Drafts by Verification Level</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Unverified</Label>
                      <Input type="number" min={1} max={50} step={1} value={maxDraftsNone} onChange={(e) => setMaxDraftsNone(e.target.value)} disabled={!canEdit} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Blue ✓</Label>
                      <Input type="number" min={1} max={50} step={1} value={maxDraftsBlue} onChange={(e) => setMaxDraftsBlue(e.target.value)} disabled={!canEdit} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Gold ✓</Label>
                      <Input type="number" min={1} max={50} step={1} value={maxDraftsGold} onChange={(e) => setMaxDraftsGold(e.target.value)} disabled={!canEdit} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </TabsContent>

        {/* ═══════ oSURE TAB ═══════ */}
        <TabsContent value="osure" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> oSURE Protection Settings
              </CardTitle>
              <CardDescription className="text-xs">Configure prediction protection tiers and premiums.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Enable oSURE</Label>
                <Switch checked={osureEnabled} onCheckedChange={setOsureEnabled} disabled={!canEdit} />
              </div>

              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">Premium Rates (% of wager)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">25% Coverage Premium (%)</Label>
                    <Input type="number" min={0} max={100} step={0.5} value={osure25Premium} onChange={(e) => setOsure25Premium(e.target.value)} disabled={!canEdit} />
                    <p className="text-[10px] text-muted-foreground">User pays this % to insure 25% of their wager</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">50% Coverage Premium (%)</Label>
                    <Input type="number" min={0} max={100} step={0.5} value={osure50Premium} onChange={(e) => setOsure50Premium(e.target.value)} disabled={!canEdit} />
                    <p className="text-[10px] text-muted-foreground">User pays this % to insure 50% of their wager</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">100% Coverage Premium (%)</Label>
                    <Input type="number" min={0} max={100} step={0.5} value={osure100Premium} onChange={(e) => setOsure100Premium(e.target.value)} disabled={!canEdit} />
                    <p className="text-[10px] text-muted-foreground">User pays this % to insure 100% of their wager</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  <strong>How it works:</strong> Premium goes to admin pool. On loss, user receives claim into protection balance. On win, premium is forfeited and protection balance unlocks to main balance.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button (sticky bottom on mobile) */}
      <div className="sticky bottom-4 z-10 sm:static sm:z-auto pt-2">
        <Button onClick={handleSave} disabled={!isValid || saving || !canEdit} className="w-full sm:w-auto shadow-lg sm:shadow-none">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {canEdit ? "Save All Settings" : "View Only — Cannot Save"}
        </Button>
      </div>

      {/* Polymarket Import Presets */}
      <PolymarketPresetsSection canEdit={canEdit} />

      {/* Sports Fixture Import Presets */}
      <SportsImportPresetsSection canEdit={canEdit} />
    </div>
  );
};

/* ─── Bulk Verification Refresh ─── */

const BulkVerificationRefresh = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<{ updated: number } | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-update-verification");
      if (error) throw error;
      setResult({ updated: data?.updated || 0 });
      toast.success(`Verification refreshed for ${data?.updated || 0} users`);
    } catch (err: any) {
      console.error("Bulk verification error:", err);
      toast.error(err.message || "Failed to refresh verifications");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card className="border-dashed border-primary/30">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 text-primary" />
              Refresh All Verifications
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Re-check NFT & token holdings for all users with connected wallets.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            {refreshing ? "Checking..." : "Refresh"}
          </Button>
        </div>
        {result && (
          <p className="text-[10px] text-primary mt-2 font-medium">
            ✓ Updated {result.updated} user(s)
          </p>
        )}
      </CardContent>
    </Card>
  );
};

/* ─── Polymarket Import Presets ─── */

const PRESET_CATEGORIES = ["Politics", "Crypto", "Sports", "Entertainment", "Science", "Economy", "AI & Tech"];

interface PolyPreset {
  id: string;
  category: string;
  max_days_ahead: number;
  max_imports_per_run: number;
  enabled: boolean;
  auto_approve: boolean;
  created_at: string;
}

const PolymarketPresetsSection = ({ canEdit }: { canEdit: boolean }) => {
  const [presets, setPresets] = useState<PolyPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCategory, setAddCategory] = useState(PRESET_CATEGORIES[0]);
  const [addMaxDays, setAddMaxDays] = useState("14");
  const [addMaxImports, setAddMaxImports] = useState("10");
  const [addAutoApprove, setAddAutoApprove] = useState(true);
  const [adding, setAdding] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const [marketCounts, setMarketCounts] = useState<Map<string, number>>(new Map());

  const fetchPresets = async () => {
    const { data, error } = await supabase
      .from("polymarket_presets" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setPresets(data as any);
    setLoading(false);
  };

  const fetchMarketCounts = async () => {
    const { data } = await supabase
      .from("markets")
      .select("category")
      .eq("resolution_source", "Polymarket");
    if (data) {
      const counts = new Map<string, number>();
      data.forEach((m: any) => {
        counts.set(m.category, (counts.get(m.category) || 0) + 1);
      });
      setMarketCounts(counts);
    }
  };

  useEffect(() => { fetchPresets(); fetchMarketCounts(); }, []);

  const handleAdd = async () => {
    const maxDays = parseInt(addMaxDays) || 14;
    const maxImports = parseInt(addMaxImports) || 10;
    if (maxDays < 1 || maxDays > 365) { toast.error("Max days must be 1-365"); return; }
    if (maxImports < 1 || maxImports > 200) { toast.error("Max imports must be 1-200"); return; }

    // Check if preset already exists for this category
    if (presets.some(p => p.category === addCategory)) {
      toast.error(`Preset for "${addCategory}" already exists`);
      return;
    }

    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("polymarket_presets" as any)
      .insert({
        category: addCategory,
        max_days_ahead: maxDays,
        max_imports_per_run: maxImports,
        enabled: true,
        auto_approve: addAutoApprove,
        created_by: user?.id,
      } as any);
    if (error) {
      toast.error(error.message || "Failed to add preset");
    } else {
      toast.success(`Preset for "${addCategory}" added`);
      fetchPresets();
    }
    setAdding(false);
  };

  const toggleEnabled = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("polymarket_presets" as any)
      .update({ enabled: !current, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (!error) {
      setPresets(prev => prev.map(p => p.id === id ? { ...p, enabled: !current } : p));
    }
  };

  const toggleAutoApprove = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("polymarket_presets" as any)
      .update({ auto_approve: !current, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (!error) {
      setPresets(prev => prev.map(p => p.id === id ? { ...p, auto_approve: !current } : p));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this preset?")) return;
    const { error } = await supabase.from("polymarket_presets" as any).delete().eq("id", id);
    if (!error) {
      setPresets(prev => prev.filter(p => p.id !== id));
      toast.success("Preset deleted");
    }
  };

  const handleImportNow = async (presetId: string) => {
    setImportingId(presetId);
    try {
      const { data, error } = await supabase.functions.invoke("import-polymarkets", {
        body: { preset_id: presetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported ${data.imported || 0} markets from Polymarket`);
      fetchMarketCounts();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    }
    setImportingId(null);
  };

  const handleImportAll = async () => {
    setImportingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-polymarkets");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported ${data.imported || 0} markets from ${data.presets_processed || 0} presets`);
      fetchMarketCounts();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    }
    setImportingAll(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const availableCategories = PRESET_CATEGORIES.filter(c => !presets.some(p => p.category === c));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5" /> Polymarket Auto-Import
        </CardTitle>
        <CardDescription>
          Configure presets to automatically import and resolve markets from Polymarket. Markets are created on behalf of the super admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Presets */}
        {presets.length > 0 && (
          <div className="space-y-2">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border ${
                  preset.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{preset.category}</span>
                    <Badge variant={preset.enabled ? "default" : "secondary"} className="text-[10px]">
                      {preset.enabled ? "Active" : "Paused"}
                    </Badge>
                    {preset.auto_approve && (
                      <Badge variant="outline" className="text-[10px]">Auto-approve</Badge>
                    )}
                    {marketCounts.has(preset.category) && (
                      <span className="text-[10px] text-muted-foreground">
                        {marketCounts.get(preset.category)} imported
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max {preset.max_days_ahead} days ahead · Limit {preset.max_imports_per_run} per run
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Enabled</span>
                    <Switch
                      checked={preset.enabled}
                      onCheckedChange={() => toggleEnabled(preset.id, preset.enabled)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Auto-approve</span>
                    <Switch
                      checked={preset.auto_approve}
                      onCheckedChange={() => toggleAutoApprove(preset.id, preset.auto_approve)}
                      disabled={!canEdit}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleImportNow(preset.id)}
                    disabled={importingId === preset.id || !preset.enabled}
                    className="text-xs h-7"
                  >
                    {importingId === preset.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Import Now
                  </Button>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(preset.id)}
                      className="text-xs h-7 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {presets.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No presets configured yet. Add one below to start importing from Polymarket.
          </div>
        )}

        {/* Add Preset Form */}
        {canEdit && availableCategories.length > 0 && (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Import Preset
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {availableCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Days Ahead</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={addMaxDays}
                    onChange={(e) => setAddMaxDays(e.target.value)}
                    placeholder="14"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Imports Per Run</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={addMaxImports}
                    onChange={(e) => setAddMaxImports(e.target.value)}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Auto-approve</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch checked={addAutoApprove} onCheckedChange={setAddAutoApprove} />
                    <span className="text-xs text-muted-foreground">{addAutoApprove ? "Markets go live" : "Require review"}</span>
                  </div>
                </div>
              </div>
              <Button onClick={handleAdd} disabled={adding} size="sm" className="text-xs">
                {adding ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                Add Preset
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Import All Button */}
        {presets.some(p => p.enabled) && (
          <Button
            onClick={handleImportAll}
            disabled={importingAll}
            variant="outline"
            className="w-full text-sm"
          >
            {importingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Import All Active Presets Now
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

/* ─── Sports Fixture Import Presets ─── */

const POPULAR_LEAGUES = [
  { id: 39, name: "Premier League", country: "England", sport: "football", logo: "https://media.api-sports.io/football/leagues/39.png" },
  { id: 140, name: "La Liga", country: "Spain", sport: "football", logo: "https://media.api-sports.io/football/leagues/140.png" },
  { id: 135, name: "Serie A", country: "Italy", sport: "football", logo: "https://media.api-sports.io/football/leagues/135.png" },
  { id: 78, name: "Bundesliga", country: "Germany", sport: "football", logo: "https://media.api-sports.io/football/leagues/78.png" },
  { id: 61, name: "Ligue 1", country: "France", sport: "football", logo: "https://media.api-sports.io/football/leagues/61.png" },
  { id: 2, name: "UEFA Champions League", country: "Europe", sport: "football", logo: "https://media.api-sports.io/football/leagues/2.png" },
  { id: 3, name: "UEFA Europa League", country: "Europe", sport: "football", logo: "https://media.api-sports.io/football/leagues/3.png" },
  { id: 332, name: "NPFL", country: "Nigeria", sport: "football", logo: "https://media.api-sports.io/football/leagues/332.png" },
  { id: 253, name: "MLS", country: "USA", sport: "football", logo: "https://media.api-sports.io/football/leagues/253.png" },
  { id: 1, name: "FIFA World Cup", country: "World", sport: "football", logo: "https://media.api-sports.io/football/leagues/1.png" },
  { id: 12, name: "NBA", country: "USA", sport: "basketball", logo: "" },
  { id: 1, name: "NFL", country: "USA", sport: "nfl", logo: "" },
  { id: 0, name: "UFC / MMA", country: "World", sport: "mma", logo: "https://media.api-sports.io/mma/leagues/1.png" },
];

interface SportsPreset {
  id: string;
  sport_type: string;
  league_id: number;
  league_name: string;
  league_logo: string | null;
  country: string | null;
  max_imports_per_run: number;
  max_days_ahead: number;
  auto_approve: boolean;
  enabled: boolean;
  created_at: string;
}

const SportsImportPresetsSection = ({ canEdit }: { canEdit: boolean }) => {
  const [presets, setPresets] = useState<SportsPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const [marketCount, setMarketCount] = useState(0);

  const [addLeagueIdx, setAddLeagueIdx] = useState(0);
  const [addMaxDays, setAddMaxDays] = useState("14");
  const [addMaxImports, setAddMaxImports] = useState("10");
  const [addAutoApprove, setAddAutoApprove] = useState(true);

  const fetchPresets = async () => {
    const { data, error } = await supabase
      .from("sports_import_presets" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setPresets(data as any);
    setLoading(false);
  };

  const fetchMarketCount = async () => {
    const { count } = await supabase
      .from("markets")
      .select("id", { count: "exact", head: true })
      .eq("resolution_source", "API-Football");
    setMarketCount(count || 0);
  };

  useEffect(() => { fetchPresets(); fetchMarketCount(); }, []);

  const handleAdd = async () => {
    const league = POPULAR_LEAGUES[addLeagueIdx];
    if (!league) return;
    const maxDays = parseInt(addMaxDays) || 14;
    const maxImports = parseInt(addMaxImports) || 10;

    if (presets.some(p => p.league_id === league.id && p.sport_type === league.sport)) {
      toast.error(`Preset for "${league.name}" already exists`);
      return;
    }

    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("sports_import_presets" as any)
      .insert({
        sport_type: league.sport,
        league_id: league.id,
        league_name: league.name,
        league_logo: league.logo || null,
        country: league.country,
        max_days_ahead: maxDays,
        max_imports_per_run: maxImports,
        auto_approve: addAutoApprove,
        enabled: true,
        created_by: user?.id,
      } as any);
    if (error) {
      toast.error(error.message || "Failed to add preset");
    } else {
      toast.success(`Preset for "${league.name}" added`);
      fetchPresets();
    }
    setAdding(false);
  };

  const toggleEnabled = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("sports_import_presets" as any)
      .update({ enabled: !current, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (!error) setPresets(prev => prev.map(p => p.id === id ? { ...p, enabled: !current } : p));
  };

  const toggleAutoApprove = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from("sports_import_presets" as any)
      .update({ auto_approve: !current, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (!error) setPresets(prev => prev.map(p => p.id === id ? { ...p, auto_approve: !current } : p));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this preset?")) return;
    const { error } = await supabase.from("sports_import_presets" as any).delete().eq("id", id);
    if (!error) {
      setPresets(prev => prev.filter(p => p.id !== id));
      toast.success("Preset deleted");
    }
  };

  const handleImportNow = async (presetId: string) => {
    setImportingId(presetId);
    try {
      const { data, error } = await supabase.functions.invoke("import-sports-fixtures", {
        body: { preset_id: presetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported ${data.imported || 0} sports markets`);
      fetchMarketCount();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    }
    setImportingId(null);
  };

  const handleImportAll = async () => {
    setImportingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-sports-fixtures");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported ${data.imported || 0} sports markets from ${data.presets_processed || 0} presets`);
      fetchMarketCount();
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    }
    setImportingAll(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const availableLeagues = POPULAR_LEAGUES.filter(l => !presets.some(p => p.league_id === l.id && p.sport_type === l.sport));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="w-5 h-5" /> Sports Fixture Auto-Import
        </CardTitle>
        <CardDescription>
          Import upcoming matches/fights from leagues via API-Sports. Football markets are multi-option (Home/Draw/Away), MMA markets are binary (Fighter 1 vs Fighter 2). Auto-resolves via sports resolution.
          {marketCount > 0 && <span className="ml-2 font-medium text-primary">{marketCount} total imported</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {presets.length > 0 && (
          <div className="space-y-2">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border ${
                  preset.enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {preset.league_logo && (
                      <img src={preset.league_logo} alt="" className="w-5 h-5 rounded-sm object-contain" />
                    )}
                    <span className="font-semibold text-sm">{preset.league_name}</span>
                    <Badge variant="outline" className="text-[10px]">{preset.sport_type}</Badge>
                    {preset.country && <span className="text-[10px] text-muted-foreground">{preset.country}</span>}
                    <Badge variant={preset.enabled ? "default" : "secondary"} className="text-[10px]">
                      {preset.enabled ? "Active" : "Paused"}
                    </Badge>
                    {preset.auto_approve && (
                      <Badge variant="outline" className="text-[10px]">Auto-approve</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Max {preset.max_days_ahead} days ahead · Limit {preset.max_imports_per_run} per run
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Enabled</span>
                    <Switch checked={preset.enabled} onCheckedChange={() => toggleEnabled(preset.id, preset.enabled)} disabled={!canEdit} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Auto-approve</span>
                    <Switch checked={preset.auto_approve} onCheckedChange={() => toggleAutoApprove(preset.id, preset.auto_approve)} disabled={!canEdit} />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleImportNow(preset.id)} disabled={importingId === preset.id || !preset.enabled} className="text-xs h-7">
                    {importingId === preset.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Import Now
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(preset.id)} className="text-xs h-7 text-destructive hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {presets.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No presets configured yet. Add a league below to start importing sports fixtures.
          </div>
        )}

        {canEdit && availableLeagues.length > 0 && (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add League Preset
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">League</Label>
                  <select
                    value={addLeagueIdx}
                    onChange={(e) => setAddLeagueIdx(Number(e.target.value))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {availableLeagues.map((l, i) => (
                      <option key={`${l.sport}-${l.id}`} value={POPULAR_LEAGUES.indexOf(l)}>
                        {l.name} ({l.country}) — {l.sport}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Days Ahead</Label>
                  <Input type="number" min={1} max={60} value={addMaxDays} onChange={(e) => setAddMaxDays(e.target.value)} placeholder="14" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Imports Per Run</Label>
                  <Input type="number" min={1} max={50} value={addMaxImports} onChange={(e) => setAddMaxImports(e.target.value)} placeholder="10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Auto-approve</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch checked={addAutoApprove} onCheckedChange={setAddAutoApprove} />
                    <span className="text-xs text-muted-foreground">{addAutoApprove ? "Markets go live" : "Require review"}</span>
                  </div>
                </div>
              </div>
              <Button onClick={handleAdd} disabled={adding} size="sm" className="text-xs">
                {adding ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                Add Preset
              </Button>
            </CardContent>
          </Card>
        )}

        {presets.some(p => p.enabled) && (
          <Button onClick={handleImportAll} disabled={importingAll} variant="outline" className="w-full text-sm">
            {importingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Import All Active Presets Now
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

/* ─── Feature Toggles Card ─── */

const TOGGLE_CATEGORIES: Record<string, { label: string; keys: string[] }> = {
  core: {
    label: "🏠 Core Platform",
    keys: ["create_market", "portfolio", "feed", "rankings", "referrals", "faq", "sales_deck", "quick_trade", "copy_trading", "copy_trade_commissions", "welcome_bonus"],
  },
  communication: {
    label: "📨 Communication & Support",
    keys: ["dm_chat", "voice_calls", "call_notifications", "chat_search", "chat_doodle_bg", "communities", "support_tickets", "user_settings"],
  },
  social: {
    label: "💬 Social Features",
    keys: ["social_profiles", "social_status_feed", "social_stories", "social_tutorial", "social_spaces", "allow_unverified_spaces", "private_spaces", "space_gifts", "space_recording", "space_chat", "status_image_upload", "live_streaming", "ai_social_generation", "my_posts_filter"],
  },
  charts: {
    label: "📊 Charts & Display",
    keys: ["line_chart", "poly_chart", "tradingview_chart", "show_wagered_stats"],
  },
  ai: {
    label: "🤖 AI Features",
    keys: ["ai_generate_description", "ai_generate_details", "ai_generate_image"],
  },
  payments: {
    label: "💰 Payments & Fiat",
    keys: ["fiat_deposit_payaza", "fiat_withdrawal", "balance_promotions", "ngn_promotions"],
  },
  integrations: {
    label: "🔗 Integrations & API",
    keys: ["public_api", "predict_via_telegram", "predict_via_whatsapp"],
  },
  system: {
    label: "⚙️ System",
    keys: ["maintenance_mode", "session_timeout"],
  },
};

const FeatureTogglesCard = () => {
  const { toggles, isLoading, setToggle, setSchedule } = useFeatureToggles();
  const { canEdit } = useAdminContext();
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["core"]));

  const maintenanceToggle = toggles.find((t: any) => t.feature_key === "maintenance_mode");

  useEffect(() => {
    if (maintenanceToggle) {
      setScheduleStart(maintenanceToggle.scheduled_start ? maintenanceToggle.scheduled_start.slice(0, 16) : "");
      setScheduleEnd(maintenanceToggle.scheduled_end ? maintenanceToggle.scheduled_end.slice(0, 16) : "");
    }
  }, [maintenanceToggle?.scheduled_start, maintenanceToggle?.scheduled_end]);

  const handleToggle = async (key: string, label: string, newVal: boolean) => {
    setTogglingKey(key);
    try {
      await setToggle(key, newVal);
      logAuditEvent({
        action: "settings_updated",
        targetType: "feature_toggle",
        details: { feature_key: key, label, enabled: newVal },
      });
      toast.success(`${label} ${newVal ? "enabled" : "disabled"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update toggle");
    } finally {
      setTogglingKey(null);
    }
  };

  const handleSaveSchedule = async () => {
    if (!scheduleStart || !scheduleEnd) {
      toast.error("Both start and end times are required");
      return;
    }
    const start = new Date(scheduleStart);
    const end = new Date(scheduleEnd);
    if (end <= start) {
      toast.error("End time must be after start time");
      return;
    }
    setSavingSchedule(true);
    try {
      await setSchedule("maintenance_mode", start.toISOString(), end.toISOString());
      logAuditEvent({
        action: "settings_updated",
        targetType: "feature_toggle",
        details: { feature_key: "maintenance_mode", scheduled_start: start.toISOString(), scheduled_end: end.toISOString() },
      });
      toast.success("Maintenance schedule saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleClearSchedule = async () => {
    setSavingSchedule(true);
    try {
      await setSchedule("maintenance_mode", null, null);
      setScheduleStart("");
      setScheduleEnd("");
      toast.success("Schedule cleared");
    } catch (err: any) {
      toast.error(err.message || "Failed to clear schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Categorize toggles
  const allCategorizedKeys = new Set(Object.values(TOGGLE_CATEGORIES).flatMap((c) => c.keys));
  const uncategorized = toggles.filter((t: any) => !allCategorizedKeys.has(t.feature_key));

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const renderToggleRow = (t: any) => (
    <div key={t.feature_key} className="space-y-2">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{t.label}</span>
          <Badge variant={t.enabled ? "default" : "secondary"} className="text-[10px]">
            {t.feature_key === "maintenance_mode"
              ? t.enabled ? "Active" : "Inactive"
              : t.enabled ? "Live" : "Hidden"}
          </Badge>
          {t.feature_key === "maintenance_mode" && t.scheduled_start && t.scheduled_end && (
            <Badge variant="outline" className="text-[10px]">
              Scheduled
            </Badge>
          )}
        </div>
        <Switch
          checked={t.enabled}
          disabled={!canEdit || togglingKey === t.feature_key}
          onCheckedChange={(val) => handleToggle(t.feature_key, t.label, val)}
        />
      </div>

      {/* Maintenance schedule section */}
      {t.feature_key === "maintenance_mode" && (
        <Card className="border-dashed ml-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="w-4 h-4" /> Scheduled Maintenance Window
            </CardTitle>
            <CardDescription className="text-xs">
              Set a start and end time. Maintenance mode will auto-activate and deactivate on schedule (checked every minute).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Time</Label>
                <Input
                  type="datetime-local"
                  value={scheduleStart}
                  onChange={(e) => setScheduleStart(e.target.value)}
                  disabled={!canEdit}
                  className="text-xs w-full min-w-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Time</Label>
                <Input
                  type="datetime-local"
                  value={scheduleEnd}
                  onChange={(e) => setScheduleEnd(e.target.value)}
                  disabled={!canEdit}
                  className="text-xs w-full min-w-0"
                />
              </div>
            </div>
            {maintenanceToggle?.scheduled_start && maintenanceToggle?.scheduled_end && (
              <div className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                Current schedule: <span className="font-medium text-foreground">{new Date(maintenanceToggle.scheduled_start).toLocaleString()}</span>
                {" → "}
                <span className="font-medium text-foreground">{new Date(maintenanceToggle.scheduled_end).toLocaleString()}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveSchedule}
                disabled={!canEdit || savingSchedule || !scheduleStart || !scheduleEnd}
                className="text-xs"
              >
                {savingSchedule ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Save Schedule
              </Button>
              {maintenanceToggle?.scheduled_start && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearSchedule}
                  disabled={!canEdit || savingSchedule}
                  className="text-xs"
                >
                  Clear Schedule
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ToggleLeft className="w-5 h-5" /> Feature Toggles
        </CardTitle>
        <CardDescription>
          Enable or disable platform features. Disabled features are hidden from public users but remain accessible to admins.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(TOGGLE_CATEGORIES).map(([catKey, cat]) => {
          const catToggles = cat.keys
            .map((k) => toggles.find((t: any) => t.feature_key === k))
            .filter(Boolean) as any[];
          if (catToggles.length === 0) return null;

          const enabledCount = catToggles.filter((t: any) => t.enabled).length;
          const isExpanded = expandedCategories.has(catKey);

          return (
            <div key={catKey} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleCategory(catKey)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{cat.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {enabledCount}/{catToggles.length} active
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 space-y-2 border-t border-border pt-2">
                  {catToggles.map(renderToggleRow)}
                </div>
              )}
            </div>
          );
        })}

        {/* Uncategorized toggles */}
        {uncategorized.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleCategory("_uncategorized")}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">🔧 Other</span>
                <span className="text-[10px] text-muted-foreground">
                  {uncategorized.filter((t: any) => t.enabled).length}/{uncategorized.length} active
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCategories.has("_uncategorized") ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedCategories.has("_uncategorized") && (
              <div className="px-4 pb-3 space-y-2 border-t border-border pt-2">
                {uncategorized.map(renderToggleRow)}
              </div>
            )}
          </div>
        )}

        {toggles.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No feature toggles found.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminSettings;
