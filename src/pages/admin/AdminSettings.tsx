import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Percent, Gift, Coins, ArrowUpFromLine, LogOut, Zap, Flame, DollarSign, Timer } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAdminContext } from "./AdminLayout";

const ALL_ASSETS = [
  { symbol: "BTC", label: "Bitcoin" },
  { symbol: "ETH", label: "Ethereum" },
  { symbol: "BNB", label: "BNB" },
  { symbol: "SOL", label: "Solana" },
  { symbol: "XRP", label: "XRP" },
  { symbol: "DOGE", label: "Dogecoin" },
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
  const [referralReward, setReferralReward] = useState("");
  const [minTokenBalance, setMinTokenBalance] = useState("");
  const [minNftBalance, setMinNftBalance] = useState("");
  const [minWithdrawalAmount, setMinWithdrawalAmount] = useState("");
  const [withdrawalCooldown, setWithdrawalCooldown] = useState("");
  const [withdrawalMultiplier, setWithdrawalMultiplier] = useState("");
  const [exitFee, setExitFee] = useState("");
  const [quickTradeFee, setQuickTradeFee] = useState("");
  const [qtMinBet, setQtMinBet] = useState("");
  const [qtMaxBet, setQtMaxBet] = useState("");
  const [qtStreak2, setQtStreak2] = useState("");
  const [qtStreak3, setQtStreak3] = useState("");
  const [qtStreak4, setQtStreak4] = useState("");
  const [qtStreak5, setQtStreak5] = useState("");
  const [qtEnabledAssets, setQtEnabledAssets] = useState<Set<string>>(new Set(ALL_ASSETS.map(a => a.symbol)));
  const [qtEnabledTimeframes, setQtEnabledTimeframes] = useState<Set<number>>(new Set(ALL_TIMEFRAMES.map(t => t.seconds)));
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
        setReferralReward(String(d.referral_reward_amount ?? 5));
        setMinTokenBalance(String(d.min_token_balance ?? 10000000));
        setMinNftBalance(String(d.min_nft_balance ?? 1));
        setMinWithdrawalAmount(String(d.min_withdrawal_amount ?? 5));
        setWithdrawalCooldown(String(d.withdrawal_cooldown_minutes ?? 5));
        setWithdrawalMultiplier(String(d.withdrawal_multiplier ?? 2));
        setExitFee(String(d.exit_fee_percent ?? 5));
        setQuickTradeFee(String(d.quick_trade_fee_percent ?? 5));
        setQtMinBet(String(d.qt_min_bet ?? 1));
        setQtMaxBet(String(d.qt_max_bet ?? 500));
        setQtStreak2(String(d.qt_streak_2x ?? 1.05));
        setQtStreak3(String(d.qt_streak_3x ?? 1.10));
        setQtStreak4(String(d.qt_streak_4x ?? 1.15));
        setQtStreak5(String(d.qt_streak_5x ?? 1.25));
        const assets = String(d.qt_enabled_assets ?? "BTC,ETH,BNB,SOL,XRP,DOGE");
        setQtEnabledAssets(new Set(assets.split(",").filter(Boolean)));
        const timeframes = String(d.qt_enabled_timeframes ?? "60,180,300,900");
        setQtEnabledTimeframes(new Set(timeframes.split(",").filter(Boolean).map(Number)));
        setSettingsId(d.id);
      }
      if (error) console.error(error);
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const adminNum = parseFloat(adminFee) || 0;
  const creatorNum = parseFloat(creatorFee) || 0;
  const referralNum = parseFloat(referralReward) || 0;
  const tokenNum = parseFloat(minTokenBalance) || 0;
  const nftNum = parseInt(minNftBalance) || 0;
  const minWithdrawNum = parseFloat(minWithdrawalAmount) || 0;
  const withdrawalCooldownNum = parseInt(withdrawalCooldown) || 5;
  const withdrawalMultiplierNum = parseFloat(withdrawalMultiplier) || 2;
  const exitFeeNum = parseFloat(exitFee) || 0;
  const quickTradeFeeNum = parseFloat(quickTradeFee) || 0;
  const qtMinBetNum = parseFloat(qtMinBet) || 0;
  const qtMaxBetNum = parseFloat(qtMaxBet) || 0;
  const qtStreak2Num = parseFloat(qtStreak2) || 1;
  const qtStreak3Num = parseFloat(qtStreak3) || 1;
  const qtStreak4Num = parseFloat(qtStreak4) || 1;
  const qtStreak5Num = parseFloat(qtStreak5) || 1;
  const totalFee = adminNum + creatorNum;
  const poolPercent = 100 - totalFee;
  const isValid =
    adminNum >= 0 && creatorNum >= 0 && totalFee <= 100 &&
    referralNum >= 0 && tokenNum >= 0 && nftNum >= 0 &&
    minWithdrawNum >= 0 && withdrawalCooldownNum >= 0 && withdrawalMultiplierNum >= 1 && exitFeeNum >= 0 && exitFeeNum <= 100 &&
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
          referral_reward_amount: referralNum,
          min_token_balance: tokenNum,
          min_nft_balance: nftNum,
          min_withdrawal_amount: minWithdrawNum,
          withdrawal_cooldown_minutes: withdrawalCooldownNum,
          withdrawal_multiplier: withdrawalMultiplierNum,
          exit_fee_percent: exitFeeNum,
          quick_trade_fee_percent: quickTradeFeeNum,
          qt_min_bet: qtMinBetNum,
          qt_max_bet: qtMaxBetNum,
          qt_streak_2x: qtStreak2Num,
          qt_streak_3x: qtStreak3Num,
          qt_streak_4x: qtStreak4Num,
          qt_streak_5x: qtStreak5Num,
          qt_enabled_assets: Array.from(qtEnabledAssets).join(","),
          qt_enabled_timeframes: Array.from(qtEnabledTimeframes).join(","),
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
          exit_fee_percent: exitFeeNum,
          min_withdrawal_amount: minWithdrawNum,
          withdrawal_cooldown_minutes: withdrawalCooldownNum,
          withdrawal_multiplier: withdrawalMultiplierNum,
          referral_reward_amount: referralNum,
          quick_trade_fee_percent: quickTradeFeeNum,
          qt_min_bet: qtMinBetNum,
          qt_max_bet: qtMaxBetNum,
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
              <Label htmlFor="creatorFee">Market Creator Fee (%)</Label>
              <Input id="creatorFee" type="number" min={0} max={100} step={0.1} value={creatorFee} onChange={(e) => setCreatorFee(e.target.value)} placeholder="3" />
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

            <div className="rounded-lg border border-border p-3 space-y-1.5 bg-muted/50">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pool Reserve</span>
                <span className="font-medium">{adminNum}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Creator Commission</span>
                <span className="font-medium">{creatorNum}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Early Exit Fee</span>
                <span className="font-medium">{exitFeeNum}%</span>
              </div>
              <div className="border-t border-border pt-1.5 flex justify-between text-sm">
                <span className="text-muted-foreground">Pool (bet amount)</span>
                <span className={`font-bold ${poolPercent < 0 ? "text-destructive" : "text-primary"}`}>{poolPercent.toFixed(1)}%</span>
              </div>
            </div>

            {totalFee > 100 && <p className="text-xs text-destructive">Total fees cannot exceed 100%.</p>}
          </CardContent>
        </Card>

        {/* ─── Quick Trade Settings ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5" /> Quick Trade Settings
            </CardTitle>
            <CardDescription>
              Configure Quick Trade fees, bet limits, streak multipliers, and available assets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fee */}
            <div className="space-y-2">
              <Label htmlFor="quickTradeFee">Platform Fee (%)</Label>
              <Input id="quickTradeFee" type="number" min={0} max={100} step={0.5} value={quickTradeFee} onChange={(e) => setQuickTradeFee(e.target.value)} placeholder="5" />
              <p className="text-[10px] text-muted-foreground">Deducted from losing pool before distributing to winners</p>
            </div>

            {/* Min/Max Bet */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4" /> Bet Limits</CardTitle>
                <CardDescription className="text-xs">Minimum and maximum bet amounts for Quick Trade rounds.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="qtMinBet" className="text-xs">Min Bet ($)</Label>
                    <Input id="qtMinBet" type="number" min={0} step={1} value={qtMinBet} onChange={(e) => setQtMinBet(e.target.value)} placeholder="1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qtMaxBet" className="text-xs">Max Bet ($)</Label>
                    <Input id="qtMaxBet" type="number" min={1} step={1} value={qtMaxBet} onChange={(e) => setQtMaxBet(e.target.value)} placeholder="500" />
                  </div>
                </div>
                {qtMaxBetNum < qtMinBetNum && <p className="text-[10px] text-destructive">Max bet must be ≥ min bet.</p>}
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
                      <span className="text-sm font-medium">{asset.symbol} <span className="text-muted-foreground font-normal">· {asset.label}</span></span>
                      <Switch
                        checked={qtEnabledAssets.has(asset.symbol)}
                        onCheckedChange={() => toggleAsset(asset.symbol)}
                        disabled={qtEnabledAssets.has(asset.symbol) && qtEnabledAssets.size <= 1}
                      />
                    </div>
                  ))}
                </div>
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
                  <Label htmlFor="minWithdrawalAmount">Minimum Withdrawal ($)</Label>
                  <Input id="minWithdrawalAmount" type="number" min={0} step={1} value={minWithdrawalAmount} onChange={(e) => setMinWithdrawalAmount(e.target.value)} placeholder="5" />
                  <p className="text-[10px] text-muted-foreground">Current: ${minWithdrawNum.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="withdrawalCooldown">Cooldown Between Withdrawals (minutes)</Label>
                  <Input id="withdrawalCooldown" type="number" min={0} step={1} value={withdrawalCooldown} onChange={(e) => setWithdrawalCooldown(e.target.value)} placeholder="5" />
                  <p className="text-[10px] text-muted-foreground">Current: {withdrawalCooldownNum} minute{withdrawalCooldownNum !== 1 ? "s" : ""}. Set to 0 to disable.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="withdrawalMultiplier">Withdrawal Multiplier (×deposits)</Label>
                  <Input id="withdrawalMultiplier" type="number" min={1} step={0.5} value={withdrawalMultiplier} onChange={(e) => setWithdrawalMultiplier(e.target.value)} placeholder="2" />
                  <p className="text-[10px] text-muted-foreground">Current: {withdrawalMultiplierNum}×. Users can withdraw up to {withdrawalMultiplierNum}× their total deposits.</p>
                  {withdrawalMultiplierNum < 1 && <p className="text-xs text-destructive">Multiplier must be at least 1×.</p>}
                </div>
              </CardContent>
            </Card>
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
              <Label htmlFor="minTokenBalance">Min BC400 Token Balance</Label>
              <Input id="minTokenBalance" type="number" min={0} step={1} value={minTokenBalance} onChange={(e) => setMinTokenBalance(e.target.value)} placeholder="10000000" />
              <p className="text-[10px] text-muted-foreground">Current: {Number(tokenNum).toLocaleString()} BC400</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minNftBalance">Min BC400 NFT Count</Label>
              <Input id="minNftBalance" type="number" min={0} step={1} value={minNftBalance} onChange={(e) => setMinNftBalance(e.target.value)} placeholder="1" />
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
    </div>
  );
};

export default AdminSettings;
