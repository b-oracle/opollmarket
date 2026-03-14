import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Percent, Gift, Coins, ArrowUpFromLine, LogOut, Zap, Flame, DollarSign, Timer, Globe, Plus, Trash2, RefreshCw, ToggleLeft, Copy, ShieldCheck, Sparkles, Banknote } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAdminContext } from "./AdminLayout";
import { Badge } from "@/components/ui/badge";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { logAuditEvent } from "@/lib/auditLog";

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
  const { canEdit } = useAdminContext();
  const [adminFee, setAdminFee] = useState("");
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
  const [withdrawalLimitEnabled, setWithdrawalLimitEnabled] = useState(true);
  const [exitFee, setExitFee] = useState("");
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
  const [payazaMode, setPayazaMode] = useState<"checkout_sdk" | "direct_api">("direct_api"); // kept for save compatibility
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("*")
        .limit(1)
        .single();
      if (data) {
        const d = data as any;
        setAdminFee(String(d.admin_fee_percent));
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
        setWithdrawalLimitEnabled(d.withdrawal_limit_enabled !== false);
        setExitFee(String(d.exit_fee_percent ?? 5));
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
        setSettingsId(d.id);
      }
      if (error) console.error(error);
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const adminNum = parseFloat(adminFee) || 0;
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
  const exitFeeNum = parseFloat(exitFee) || 0;
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
  const maxTotalFee = Math.max(adminNum + creatorNum, adminNum + creatorBlueNum, adminNum + creatorGoldNum) + referrerCommissionNum;
  const totalFee = adminNum + creatorNum + referrerCommissionNum;
  const poolPercent = 100 - totalFee;
  const isValid =
    adminNum >= 0 && creatorNum >= 0 && creatorBlueNum >= 0 && creatorGoldNum >= 0 && referrerCommissionNum >= 0 && maxTotalFee <= 100 &&
    referralNum >= 0 && tokenNum >= 0 && nftNum >= 0 &&
    minWithdrawNum >= 0 && withdrawalCooldownNum >= 0 && withdrawalMultiplierNum >= 1 && exitFeeNum >= 0 && exitFeeNum <= 100 && withdrawalFeeNum >= 0 && withdrawalFeeNum <= 100 && copyTradeCommissionNum >= 0 && copyTradeCommissionNum <= 100 &&
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
          admin_fee_percent: adminNum,
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
           exit_fee_percent: exitFeeNum,
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
          admin_fee_percent: adminNum,
          creator_fee_percent: creatorNum,
          creator_fee_blue_percent: creatorBlueNum,
          creator_fee_gold_percent: creatorGoldNum,
          referrer_commission_percent: referrerCommissionNum,
           exit_fee_percent: exitFeeNum,
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Platform Settings</h1>

      {/* ─── Feature Toggles (Super Admin only) ─── */}
      <FeatureTogglesCard />

      {/* Fiat settings moved to dedicated Fiat Settings page */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        {/* ─── Market Prediction Fees ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Percent className="w-5 h-5" /> Market Prediction Fees
            </CardTitle>
            <CardDescription>
              Commission deducted from each market prediction. The remainder goes to the pool.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminFee">Pool Reserve (%)</Label>
              <Input id="adminFee" type="number" min={0} max={100} step={0.1} value={adminFee} onChange={(e) => setAdminFee(e.target.value)} placeholder="2" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creatorFee">Creator Fee — No Tick (%)</Label>
              <Input id="creatorFee" type="number" min={0} max={100} step={0.1} value={creatorFee} onChange={(e) => setCreatorFee(e.target.value)} placeholder="3" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creatorFeeBlue">Creator Fee — Blue Tick (%)</Label>
              <Input id="creatorFeeBlue" type="number" min={0} max={100} step={0.1} value={creatorFeeBlue} onChange={(e) => setCreatorFeeBlue(e.target.value)} placeholder="4" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creatorFeeGold">Creator Fee — Gold Tick (%)</Label>
              <Input id="creatorFeeGold" type="number" min={0} max={100} step={0.1} value={creatorFeeGold} onChange={(e) => setCreatorFeeGold(e.target.value)} placeholder="5" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="referrerCommission">Referrer Commission (%)</Label>
              <Input id="referrerCommission" type="number" min={0} max={100} step={0.1} value={referrerCommission} onChange={(e) => setReferrerCommission(e.target.value)} placeholder="1" />
              <p className="text-[10px] text-muted-foreground">% of each trade paid to the trader's referrer</p>
            </div>

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><LogOut className="w-4 h-4" /> Early Exit Fee</CardTitle>
                <CardDescription className="text-xs">Fee charged when users sell positions early. Returned to market pool.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="exitFee">Exit Fee (%)</Label>
                  <Input id="exitFee" type="number" min={0} max={100} step={0.5} value={exitFee} onChange={(e) => setExitFee(e.target.value)} placeholder="5" />
                  <p className="text-[10px] text-muted-foreground">Current: {exitFeeNum}%</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Copy className="w-4 h-4" /> Copy Trade Commission</CardTitle>
                <CardDescription className="text-xs">% of profit deducted from copiers and credited to the original trader when their copied trade wins.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="copyTradeCommission">Commission (%)</Label>
                  <Input id="copyTradeCommission" type="number" min={0} max={100} step={0.5} value={copyTradeCommission} onChange={(e) => setCopyTradeCommission(e.target.value)} placeholder="10" />
                  <p className="text-[10px] text-muted-foreground">Current: {copyTradeCommissionNum}%</p>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-border p-3 space-y-1.5 bg-muted/50">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pool Reserve</span>
                <span className="font-medium">{adminNum}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Creator (No Tick)</span>
                <span className="font-medium">{creatorNum}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Creator (Blue Tick)</span>
                <span className="font-medium">{creatorBlueNum}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Creator (Gold Tick)</span>
                <span className="font-medium">{creatorGoldNum}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Referrer Commission</span>
                <span className="font-medium">{referrerCommissionNum}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Early Exit Fee</span>
                <span className="font-medium">{exitFeeNum}%</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground">Pool (trade amount)</span>
                <span className={`font-bold ${poolPercent < 0 ? "text-destructive" : "text-primary"}`}>{poolPercent.toFixed(1)}%</span>
              </div>
            </div>

            {maxTotalFee > 100 && <p className="text-xs text-destructive">Total fees cannot exceed 100%.</p>}
          </CardContent>
        </Card>

        {/* ─── Quick Trade Settings ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5" /> Quick Trade Settings
            </CardTitle>
            <CardDescription>
              Configure Quick Trade fees, trade limits, streak multipliers, and available assets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fee */}
            <div className="space-y-2">
              <Label htmlFor="quickTradeFee">Platform Fee (%)</Label>
              <Input id="quickTradeFee" type="number" min={0} max={100} step={0.5} value={quickTradeFee} onChange={(e) => setQuickTradeFee(e.target.value)} placeholder="5" />
              <p className="text-[10px] text-muted-foreground">Deducted from losing pool before distributing to winners</p>
            </div>

            {/* One-Sided Bonus Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-primary" /> One-Sided Bonus
                </Label>
                <p className="text-[10px] text-muted-foreground">No fee + 0.5% bonus when all bets are on the winning side</p>
              </div>
              <Switch
                checked={qtOneSidedBonus}
                onCheckedChange={setQtOneSidedBonus}
              />
            </div>

            {/* Min/Max Bet */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4" /> Trade Limits</CardTitle>
                <CardDescription className="text-xs">Minimum and maximum trade amounts for Quick Trade rounds.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
                {qtMaxBetNum < qtMinBetNum && <p className="text-[10px] text-destructive">Max trade must be ≥ min trade.</p>}
              </CardContent>
            </Card>

            {/* Streak Multipliers */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Flame className="w-4 h-4" /> Streak Multipliers</CardTitle>
                <CardDescription className="text-xs">Bonus multipliers applied to winnings based on consecutive win streaks.</CardDescription>
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
                <div className="rounded-lg bg-muted/50 p-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground font-medium">Preview</p>
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">2 wins → ×{qtStreak2Num.toFixed(2)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">3 wins → ×{qtStreak3Num.toFixed(2)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">4 wins → ×{qtStreak4Num.toFixed(2)}</span>
                    <span className="px-1.5 py-0.5 rounded bg-background border border-border">5+ wins → ×{qtStreak5Num.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Enabled Assets */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4" /> Available Assets</CardTitle>
                <CardDescription className="text-xs">Toggle which assets are available in Quick Trade. At least one must be enabled.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ALL_ASSETS.map(asset => (
                    <div key={asset.symbol} className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{asset.symbol} <span className="text-muted-foreground font-normal">· {asset.label}</span></span>
                        {qtDisabledAssets.has(asset.symbol) && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">⚠️ Unavailable</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {qtDisabledAssets.has(asset.symbol) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              setQtDisabledAssets(prev => {
                                const next = new Set(prev);
                                next.delete(asset.symbol);
                                return next;
                              });
                            }}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Re-enable
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
                    <p className="text-[11px] text-destructive font-medium">⚠️ {qtDisabledAssets.size} asset(s) auto-disabled due to API errors. Click "Re-enable" then Save to restore.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Enabled Timeframes */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Timer className="w-4 h-4" /> Round Durations</CardTitle>
                <CardDescription className="text-xs">Toggle which round durations are available in Quick Trade. At least one must be enabled.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ALL_TIMEFRAMES.map(tf => (
                    <div key={tf.seconds} className="flex items-center justify-between py-1">
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
          </CardContent>
        </Card>

        {/* ─── Other Settings ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Gift className="w-5 h-5" /> Referrals & Withdrawals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Gift className="w-4 h-4" /> Referral Reward</CardTitle>
                <CardDescription className="text-xs">Fixed amount credited to referrer's bonus balance on first prediction by referral.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="referralReward">Reward Amount ($)</Label>
                  <Input id="referralReward" type="number" min={0} step={0.5} value={referralReward} onChange={(e) => setReferralReward(e.target.value)} placeholder="5" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><ArrowUpFromLine className="w-4 h-4" /> Withdrawal Settings</CardTitle>
                <CardDescription className="text-xs">Minimum amount users must withdraw. Set to 0 for any amount.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="withdrawalFee">Withdrawal Fee (%)</Label>
                  <Input id="withdrawalFee" type="number" min={0} max={100} step={0.5} value={withdrawalFee} onChange={(e) => setWithdrawalFee(e.target.value)} placeholder="0" />
                  <p className="text-[10px] text-muted-foreground">Current: {withdrawalFeeNum}%. Deducted from withdrawal amount before sending. Set to 0 for no fee.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minWithdrawalAmount">Minimum Withdrawal ($)</Label>
                  <Input id="minWithdrawalAmount" type="number" min={0} step={1} value={minWithdrawalAmount} onChange={(e) => setMinWithdrawalAmount(e.target.value)} placeholder="5" />
                  <p className="text-[10px] text-muted-foreground">Current: ${minWithdrawNum.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="withdrawalCooldown">Cooldown Between Withdrawals (minutes)</Label>
                  <Input id="withdrawalCooldown" type="number" min={0} step={1} value={withdrawalCooldown} onChange={(e) => setWithdrawalCooldown(e.target.value)} placeholder="5" />
                  <p className="text-[10px] text-muted-foreground">Current: {withdrawalCooldownNum} minute{withdrawalCooldownNum !== 1 ? "s" : ""}. Set to 0 to disable.</p>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-border pt-3">
                  <div>
                    <Label className="text-sm font-medium">Withdrawal Limit</Label>
                    <p className="text-[10px] text-muted-foreground">When enabled, users can only withdraw up to {withdrawalMultiplierNum}× their deposits. When off, users can withdraw their full balance.</p>
                  </div>
                  <Switch checked={withdrawalLimitEnabled} onCheckedChange={setWithdrawalLimitEnabled} />
                </div>
                {withdrawalLimitEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="withdrawalMultiplier">Withdrawal Multiplier (×deposits)</Label>
                  <Input id="withdrawalMultiplier" type="number" min={1} step={0.5} value={withdrawalMultiplier} onChange={(e) => setWithdrawalMultiplier(e.target.value)} placeholder="2" />
                  <p className="text-[10px] text-muted-foreground">Current: {withdrawalMultiplierNum}×. Users can withdraw up to {withdrawalMultiplierNum}× their total deposits.</p>
                  {withdrawalMultiplierNum < 1 && <p className="text-xs text-destructive">Multiplier must be at least 1×.</p>}
                </div>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        {/* ─── Verified Member Benefits ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" /> Verified Member Benefits
            </CardTitle>
            <CardDescription>Configure trending multipliers and revenue sharing for verified creators.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BulkVerificationRefresh />
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Flame className="w-4 h-4" /> Trending Multiplier</CardTitle>
                <CardDescription className="text-xs">Verified creators' markets get a boosted trending score.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Blue Tier (×)</Label>
                    <Input type="number" min={1} max={5} step={0.1} value={blueTrendingMult} onChange={(e) => setBlueTrendingMult(e.target.value)} placeholder="1.2" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gold Tier (×)</Label>
                    <Input type="number" min={1} max={5} step={0.1} value={goldTrendingMult} onChange={(e) => setGoldTrendingMult(e.target.value)} placeholder="1.5" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">A verified creator's market trending score is multiplied by this factor.</p>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4" /> Revenue Sharing</CardTitle>
                <CardDescription className="text-xs">Percentage of creator fees from own markets shared with verified creators as bonus balance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Blue Tier (%)</Label>
                    <Input type="number" min={0} max={100} step={0.5} value={blueRevenueShare} onChange={(e) => setBlueRevenueShare(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gold Tier (%)</Label>
                    <Input type="number" min={0} max={100} step={0.5} value={goldRevenueShare} onChange={(e) => setGoldRevenueShare(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground font-medium">Preview (based on {creatorNum}% creator fee)</p>
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-background border border-primary/30 text-primary">Blue: {blueRevenueShareNum}% of creator fee</span>
                    <span className="px-1.5 py-0.5 rounded bg-background border border-accent/50 text-accent-foreground">Gold: {goldRevenueShareNum}% of creator fee</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Distributed automatically every 24h to verified creators' bonus balance from their own resolved markets.</p>
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        {/* ─── AI Generation Settings ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> AI Generation
            </CardTitle>
            <CardDescription>Cost per AI generation (description, details, or image). Individual features can be toggled on/off via Feature Toggles above.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="aiGenerationCost">Cost per Generation ($)</Label>
              <Input id="aiGenerationCost" type="number" min={0} step={0.1} value={aiGenerationCost} onChange={(e) => setAiGenerationCost(e.target.value)} placeholder="0.50" />
              <p className="text-[10px] text-muted-foreground">Current: ${aiGenerationCostNum.toFixed(2)}. Charged per AI-generated description, details, or image.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-[10px] font-medium text-foreground">Feature Toggles</p>
              <p className="text-[10px] text-muted-foreground">Use the <strong>Feature Toggles</strong> section at the top of this page to individually enable/disable:</p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5 ml-3 list-disc">
                <li><strong>AI Generate Description</strong> — auto-generate market descriptions</li>
                <li><strong>AI Generate Details</strong> — auto-generate detailed market content</li>
                <li><strong>AI Generate Image</strong> — auto-generate cover images</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* ─── Creator Gate ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Coins className="w-5 h-5" /> Creator Gate Thresholds
            </CardTitle>
            <CardDescription>Minimum BC400 token and NFT holdings required to create markets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="minTokenBalance">Min BC400 for Blue Tick</Label>
              <Input id="minTokenBalance" type="number" min={0} step={1} value={minTokenBalance} onChange={(e) => setMinTokenBalance(e.target.value)} placeholder="10000000" />
              <p className="text-[10px] text-muted-foreground">Current: {Number(tokenNum).toLocaleString()} BC400</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minGoldTokenBalance">Min BC400 for Gold Tick</Label>
              <Input id="minGoldTokenBalance" type="number" min={0} step={1} value={minGoldTokenBalance} onChange={(e) => setMinGoldTokenBalance(e.target.value)} placeholder="100000000" />
              <p className="text-[10px] text-muted-foreground">Current: {Number(goldTokenNum).toLocaleString()} BC400</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minNftBalance">Min BC400 NFT Count</Label>
              <Input id="minNftBalance" type="number" min={0} step={1} value={minNftBalance} onChange={(e) => setMinNftBalance(e.target.value)} placeholder="1" />
            </div>
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-semibold text-foreground mb-2">Free Market Limits (per verification tier)</p>
              <p className="text-[10px] text-muted-foreground mb-3">Max active/pending markets before a creation fee is required.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="blueMaxFreeMarkets">Blue Tick Limit</Label>
                  <Input id="blueMaxFreeMarkets" type="number" min={1} step={1} value={blueMaxFreeMarkets} onChange={(e) => setBlueMaxFreeMarkets(e.target.value)} placeholder="5" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="goldMaxFreeMarkets">Gold Tick Limit</Label>
                  <Input id="goldMaxFreeMarkets" type="number" min={1} step={1} value={goldMaxFreeMarkets} onChange={(e) => setGoldMaxFreeMarkets(e.target.value)} placeholder="20" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="max-w-4xl mt-6">
        {referralNum < 0 && <p className="text-xs text-destructive mb-2">Referral reward amount cannot be negative.</p>}
        <Button onClick={handleSave} disabled={!isValid || saving || !canEdit} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {canEdit ? "Save All Settings" : "View Only — Cannot Save"}
        </Button>
      </div>

      {/* Polymarket Import Presets */}
      <div className="max-w-4xl mt-8">
        <PolymarketPresetsSection canEdit={canEdit} />
      </div>
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

/* ─── Feature Toggles Card ─── */
const FeatureTogglesCard = () => {
  const { toggles, isLoading, setToggle, setSchedule } = useFeatureToggles();
  const { canEdit } = useAdminContext();
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const maintenanceToggle = toggles.find((t: any) => t.feature_key === "maintenance_mode");

  // Sync schedule inputs when data loads
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

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

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
      <CardContent className="space-y-3">
        {toggles.map((t: any) => (
          <div key={t.feature_key} className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Start Time</Label>
                      <Input
                        type="datetime-local"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        disabled={!canEdit}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">End Time</Label>
                      <Input
                        type="datetime-local"
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(e.target.value)}
                        disabled={!canEdit}
                        className="text-xs"
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
        ))}
        {toggles.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No feature toggles found.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminSettings;
