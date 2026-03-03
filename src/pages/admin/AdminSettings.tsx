import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Percent } from "lucide-react";
import { toast } from "sonner";

const AdminSettings = () => {
  const [adminFee, setAdminFee] = useState("");
  const [creatorFee, setCreatorFee] = useState("");
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
        setSettingsId(data.id);
      }
      if (error) console.error(error);
      setLoading(false);
    };
    fetch();
  }, []);

  const adminNum = parseFloat(adminFee) || 0;
  const creatorNum = parseFloat(creatorFee) || 0;
  const totalFee = adminNum + creatorNum;
  const poolPercent = 100 - totalFee;
  const isValid = adminNum >= 0 && creatorNum >= 0 && totalFee <= 100;

  const handleSave = async () => {
    if (!isValid || !settingsId) return;
    setSaving(true);
    const { error } = await supabase
      .from("commission_settings")
      .update({
        admin_fee_percent: adminNum,
        creator_fee_percent: creatorNum,
        updated_at: new Date().toISOString(),
      })
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
