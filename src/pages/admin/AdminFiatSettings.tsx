import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Banknote, RefreshCw, DollarSign, Percent, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useAdminContext } from "./AdminLayout";
import { logAuditEvent } from "@/lib/auditLog";

const PROVIDERS = [
  { value: "payaza", label: "Payaza", desc: "Virtual account via Payaza API. Requires IP whitelisting." },
  { value: "flutterwave", label: "Flutterwave", desc: "Bank transfer via Flutterwave charge API. More comprehensive bank coverage." },
] as const;

const AdminFiatSettings = () => {
  const { canEdit } = useAdminContext();
  const [depositProvider, setDepositProvider] = useState<string>("payaza");
  const [payoutProvider, setPayoutProvider] = useState<string>("payaza");
  const [nairaRateMarkup, setNairaRateMarkup] = useState("");
  const [fallbackNairaRate, setFallbackNairaRate] = useState("");
  const [nairaPayoutMarkdown, setNairaPayoutMarkdown] = useState("");
  const [fallbackPayoutNairaRate, setFallbackPayoutNairaRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const [fetchingRate, setFetchingRate] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("id, payaza_mode, payout_provider, naira_rate_markup, fallback_naira_rate, naira_payout_markdown, fallback_payout_naira_rate")
        .limit(1)
        .single();
      if (data) {
        const d = data as any;
        setDepositProvider(d.deposit_provider || "payaza");
        setPayoutProvider(d.payout_provider || "payaza");
        setNairaRateMarkup(String(d.naira_rate_markup ?? 0));
        setFallbackNairaRate(String(d.fallback_naira_rate ?? 1500));
        setNairaPayoutMarkdown(String(d.naira_payout_markdown ?? 0));
        setFallbackPayoutNairaRate(String(d.fallback_payout_naira_rate ?? 1500));
        setSettingsId(d.id);
      }
      if (error) console.error(error);
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const fetchLiveRate = async () => {
    setFetchingRate(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-naira-rate");
      if (error) throw error;
      setLiveRate(data?.live_rate ?? null);
    } catch (err: any) {
      toast.error("Failed to fetch live rate");
    } finally {
      setFetchingRate(false);
    }
  };

  const markupNum = parseFloat(nairaRateMarkup) || 0;
  const fallbackNum = parseFloat(fallbackNairaRate) || 1500;
  const payoutMarkdownNum = parseFloat(nairaPayoutMarkdown) || 0;
  const fallbackPayoutNum = parseFloat(fallbackPayoutNairaRate) || 1500;
  const effectiveRate = liveRate ? Math.round(liveRate * (1 + markupNum / 100) * 100) / 100 : null;
  const effectivePayoutRate = liveRate ? Math.round(liveRate * (1 - payoutMarkdownNum / 100) * 100) / 100 : null;

  const isValid = markupNum >= 0 && markupNum <= 100 && fallbackNum > 0 && payoutMarkdownNum >= 0 && payoutMarkdownNum <= 100 && fallbackPayoutNum > 0;

  const handleSave = async () => {
    if (!isValid || !settingsId) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("commission_settings")
        .update({
          deposit_provider: depositProvider,
          payout_provider: payoutProvider,
          // Keep payaza_mode for backward compat
          payaza_mode: "direct_api",
          naira_rate_markup: markupNum,
          fallback_naira_rate: fallbackNum,
          naira_payout_markdown: payoutMarkdownNum,
          fallback_payout_naira_rate: fallbackPayoutNum,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null,
        } as any)
        .eq("id", settingsId);
      if (error) throw error;

      logAuditEvent({
        action: "settings_updated",
        targetId: settingsId,
        targetType: "commission_settings",
        details: { deposit_provider: depositProvider, payout_provider: payoutProvider, naira_rate_markup: markupNum, fallback_naira_rate: fallbackNum, naira_payout_markdown: payoutMarkdownNum, fallback_payout_naira_rate: fallbackPayoutNum },
      });

      toast.success("Fiat settings saved successfully");
    } catch (err: any) {
      console.error("Save fiat settings error:", err);
      toast.error(err.message || "Failed to save fiat settings");
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

  const renderProviderToggle = (
    label: string,
    icon: React.ReactNode,
    description: string,
    value: string,
    onChange: (v: string) => void
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {icon} {label}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              onClick={() => canEdit && onChange(p.value)}
              className={`flex-1 rounded-xl border-2 p-4 text-left transition-all ${
                value === p.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              } ${!canEdit ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  value === p.value ? "border-primary" : "border-muted-foreground/40"
                }`}>
                  {value === p.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <span className="text-sm font-bold">{p.label}</span>
                {p.value === "flutterwave" && <Badge variant="secondary" className="text-[10px]">New</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground ml-6">{p.desc}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Fiat Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        {/* ─── Deposit Provider ─── */}
        {renderProviderToggle(
          "NGN Deposit Provider",
          <ArrowDownToLine className="w-5 h-5" />,
          "Choose which payment provider handles NGN deposits. Users will see bank transfer details from the selected provider.",
          depositProvider,
          setDepositProvider
        )}

        {/* ─── Withdrawal Provider ─── */}
        {renderProviderToggle(
          "NGN Withdrawal Provider",
          <ArrowUpFromLine className="w-5 h-5" />,
          "Choose which provider processes NGN withdrawal payouts to user bank accounts.",
          payoutProvider,
          setPayoutProvider
        )}

        {/* ─── Naira Exchange Rate ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5" /> NGN Exchange Rate
            </CardTitle>
            <CardDescription>
              Configure the USD→NGN exchange rate markup and fallback rate used for fiat deposits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nairaRateMarkup">Rate Markup (%)</Label>
              <Input
                id="nairaRateMarkup"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={nairaRateMarkup}
                onChange={(e) => setNairaRateMarkup(e.target.value)}
                placeholder="0"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-muted-foreground">
                Current: {markupNum}%. Added on top of the live USD→NGN rate.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fallbackNairaRate">Fallback Rate (₦ per $1)</Label>
              <Input
                id="fallbackNairaRate"
                type="number"
                min={1}
                step={1}
                value={fallbackNairaRate}
                onChange={(e) => setFallbackNairaRate(e.target.value)}
                placeholder="1500"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-muted-foreground">
                Used when the live exchange rate API is unavailable. Current: ₦{fallbackNum.toLocaleString()}
              </p>
            </div>

            {/* Live rate preview */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Live Rate Preview</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchLiveRate}
                  disabled={fetchingRate}
                  className="h-7 text-[11px]"
                >
                  {fetchingRate ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  Fetch
                </Button>
              </div>
              {liveRate !== null ? (
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Market rate</span>
                    <span className="font-medium">₦{liveRate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Markup ({markupNum}%)</span>
                    <span className="font-medium">+₦{((liveRate * markupNum / 100)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground font-semibold">Effective rate</span>
                    <span className="font-bold text-primary">₦{effectiveRate?.toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">Click "Fetch" to see the current live rate.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ─── NGN Payout Markdown ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Percent className="w-5 h-5" /> NGN Payout Rate
            </CardTitle>
            <CardDescription>
              Configure the markdown applied to the live rate for NGN withdrawals. Users receive less NGN per USD compared to deposits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nairaPayoutMarkdown">Payout Rate Markdown (%)</Label>
              <Input
                id="nairaPayoutMarkdown"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={nairaPayoutMarkdown}
                onChange={(e) => setNairaPayoutMarkdown(e.target.value)}
                placeholder="0"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-muted-foreground">
                Current: {payoutMarkdownNum}%. Subtracted from the live USD→NGN rate for payouts.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fallbackPayoutNairaRate">Fallback Payout Rate (₦ per $1)</Label>
              <Input
                id="fallbackPayoutNairaRate"
                type="number"
                min={1}
                step={1}
                value={fallbackPayoutNairaRate}
                onChange={(e) => setFallbackPayoutNairaRate(e.target.value)}
                placeholder="1500"
                disabled={!canEdit}
              />
              <p className="text-[10px] text-muted-foreground">
                Used when the live exchange rate API is unavailable for payouts. Current: ₦{fallbackPayoutNum.toLocaleString()}
              </p>
            </div>

            {liveRate !== null && (
              <div className="rounded-lg border border-border p-3 space-y-1 bg-muted/50">
                <p className="text-xs font-semibold">Payout Rate Preview</p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Market rate</span>
                    <span className="font-medium">₦{liveRate.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Markdown ({payoutMarkdownNum}%)</span>
                    <span className="font-medium text-destructive">−₦{((liveRate * payoutMarkdownNum / 100)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground font-semibold">User receives</span>
                    <span className="font-bold text-primary">₦{effectivePayoutRate?.toLocaleString()}/USD</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Example: $100 withdrawal</span>
                    <span className="font-medium">₦{effectivePayoutRate ? (effectivePayoutRate * 100).toLocaleString() : "—"}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="max-w-4xl mt-6">
        <Button onClick={handleSave} disabled={!isValid || saving || !canEdit} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {canEdit ? "Save Fiat Settings" : "View Only — Cannot Save"}
        </Button>
      </div>
    </div>
  );
};

export default AdminFiatSettings;
