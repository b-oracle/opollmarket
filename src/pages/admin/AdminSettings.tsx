import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Percent, Gift, Coins, ImageIcon } from "lucide-react";
import { toast } from "sonner";

const AdminSettings = () => {
  const [adminFee, setAdminFee] = useState("");
  const [creatorFee, setCreatorFee] = useState("");
  const [referralReward, setReferralReward] = useState("");
  const [minTokenBalance, setMinTokenBalance] = useState("");
  const [minNftBalance, setMinNftBalance] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("*")
        .limit(1)
        .single();
      if (data) {
        setAdminFee(String(data.admin_fee_percent));
        setCreatorFee(String(data.creator_fee_percent));
        setReferralReward(String(data.referral_reward_amount ?? 5));
        setMinTokenBalance(String((data as any).min_token_balance ?? 10000000));
        setMinNftBalance(String((data as any).min_nft_balance ?? 1));
        setSettingsId(data.id);
      }
      if (error) console.error(error);
      setLoading(false);
    };
    fetch();
  }, []);

  const adminNum = parseFloat(adminFee) || 0;
  const creatorNum = parseFloat(creatorFee) || 0;
  const referralNum = parseFloat(referralReward) || 0;
  const tokenNum = parseFloat(minTokenBalance) || 0;
  const nftNum = parseInt(minNftBalance) || 0;
  const totalFee = adminNum + creatorNum;
  const poolPercent = 100 - totalFee;
  const isValid = adminNum >= 0 && creatorNum >= 0 && totalFee <= 100 && referralNum >= 0 && tokenNum >= 0 && nftNum >= 0;

  const handleSave = async () => {
    if (!isValid || !settingsId) return;
    setSaving(true);
    const { error } = await supabase
      .from("commission_settings")
      .update({
        admin_fee_percent: adminNum,
        creator_fee_percent: creatorNum,
        referral_reward_amount: referralNum,
        min_token_balance: tokenNum,
        min_nft_balance: nftNum,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", settingsId);
    setSaving(false);
    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Commission settings saved");
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
      <h1 className="text-2xl font-bold mb-6">Commission Settings</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Percent className="w-5 h-5" /> Fee Configuration
          </CardTitle>
          <CardDescription>
            Set the commission percentages deducted from each prediction. The remainder goes to the pool.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adminFee">Admin Fee (%)</Label>
            <Input
              id="adminFee"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={adminFee}
              onChange={(e) => setAdminFee(e.target.value)}
              placeholder="2"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="creatorFee">Market Creator Fee (%)</Label>
            <Input
              id="creatorFee"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={creatorFee}
              onChange={(e) => setCreatorFee(e.target.value)}
              placeholder="3"
            />
          </div>

          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gift className="w-4 h-4" /> Referral Reward
              </CardTitle>
              <CardDescription className="text-xs">
                Fixed amount credited to referrer's bonus balance when their referral places their first prediction. Non-withdrawable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="referralReward">Reward Amount ($)</Label>
                <Input
                  id="referralReward"
                  type="number"
                  min={0}
                  step={0.5}
                  value={referralReward}
                  onChange={(e) => setReferralReward(e.target.value)}
                  placeholder="5"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Coins className="w-4 h-4" /> Creator Gate Thresholds
              </CardTitle>
              <CardDescription className="text-xs">
                Minimum BC400 token and NFT holdings required to create markets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="minTokenBalance">Min BC400 Token Balance</Label>
                <Input
                  id="minTokenBalance"
                  type="number"
                  min={0}
                  step={1}
                  value={minTokenBalance}
                  onChange={(e) => setMinTokenBalance(e.target.value)}
                  placeholder="10000000"
                />
                <p className="text-[10px] text-muted-foreground">
                  Current: {Number(tokenNum).toLocaleString()} BC400
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minNftBalance">Min BC400 NFT Count</Label>
                <Input
                  id="minNftBalance"
                  type="number"
                  min={0}
                  step={1}
                  value={minNftBalance}
                  onChange={(e) => setMinNftBalance(e.target.value)}
                  placeholder="1"
                />
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-border p-3 space-y-1.5 bg-muted/50">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Admin Commission</span>
              <span className="font-medium">{adminNum}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Creator Commission</span>
              <span className="font-medium">{creatorNum}%</span>
            </div>
            <div className="border-t border-border pt-1.5 flex justify-between text-sm">
              <span className="text-muted-foreground">Pool (bet amount)</span>
              <span className={`font-bold ${poolPercent < 0 ? "text-destructive" : "text-primary"}`}>
                {poolPercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {totalFee > 100 && (
            <p className="text-xs text-destructive">Total fees cannot exceed 100%.</p>
          )}
          {referralNum < 0 && (
            <p className="text-xs text-destructive">Referral reward amount cannot be negative.</p>
          )}

          <Button onClick={handleSave} disabled={!isValid || saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
