import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContext } from "@/pages/admin/AdminLayout";

interface AutoBroadcastSetting {
  id: string;
  event_type: string;
  enabled: boolean;
  title_template: string;
  body_template: string;
  url_template: string;
  segment_id: string | null;
}

const EVENT_LABELS: Record<string, { label: string; emoji: string }> = {
  market_created: { label: "New Market Created", emoji: "🔥" },
  market_resolved: { label: "Market Resolved", emoji: "✅" },
  market_trending: { label: "Market Trending", emoji: "📈" },
  big_deposit: { label: "Big Deposit Alert", emoji: "💰" },
  new_sports_market: { label: "New Sports Market", emoji: "⚽" },
};

const AimtellAutoBroadcast = () => {
  const { canEdit } = useAdminContext();
  const [settings, setSettings] = useState<AutoBroadcastSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("aimtell_auto_broadcast_settings" as any)
      .select("*")
      .order("event_type");
    if (error) {
      toast.error("Failed to load auto-broadcast settings");
    } else {
      setSettings((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const toggleEvent = async (setting: AutoBroadcastSetting) => {
    setSaving(setting.id);
    const { error } = await supabase
      .from("aimtell_auto_broadcast_settings" as any)
      .update({ enabled: !setting.enabled, updated_at: new Date().toISOString() } as any)
      .eq("id", setting.id);
    if (error) {
      toast.error("Failed to update");
    } else {
      setSettings(prev => prev.map(s => s.id === setting.id ? { ...s, enabled: !s.enabled } : s));
      toast.success(`${setting.event_type} auto-broadcast ${!setting.enabled ? "enabled" : "disabled"}`);
    }
    setSaving(null);
  };

  const updateTemplate = async (id: string, field: string, value: string) => {
    setSettings(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const saveTemplate = async (setting: AutoBroadcastSetting) => {
    setSaving(setting.id);
    const { error } = await supabase
      .from("aimtell_auto_broadcast_settings" as any)
      .update({
        title_template: setting.title_template,
        body_template: setting.body_template,
        url_template: setting.url_template,
        segment_id: setting.segment_id || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", setting.id);
    if (error) {
      toast.error("Failed to save template");
    } else {
      toast.success("Template saved");
    }
    setSaving(null);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Auto-Broadcast Events</CardTitle>
            <CardDescription>Automatically push notifications when key events happen</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchSettings}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.map((setting) => {
          const meta = EVENT_LABELS[setting.event_type] || { label: setting.event_type, emoji: "📣" };
          return (
            <div key={setting.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.emoji}</span>
                  <span className="font-medium text-sm">{meta.label}</span>
                </div>
                <Switch
                  checked={setting.enabled}
                  onCheckedChange={() => toggleEvent(setting)}
                  disabled={!canEdit || saving === setting.id}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Title Template</Label>
                  <Input
                    value={setting.title_template}
                    onChange={(e) => updateTemplate(setting.id, "title_template", e.target.value)}
                    className="text-xs h-8"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Body Template</Label>
                  <Input
                    value={setting.body_template}
                    onChange={(e) => updateTemplate(setting.id, "body_template", e.target.value)}
                    className="text-xs h-8"
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">URL Template</Label>
                  <Input
                    value={setting.url_template}
                    onChange={(e) => updateTemplate(setting.id, "url_template", e.target.value)}
                    className="text-xs h-8"
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Segment ID (optional)</Label>
                  <Input
                    value={setting.segment_id || ""}
                    onChange={(e) => updateTemplate(setting.id, "segment_id", e.target.value)}
                    placeholder="Leave blank = all"
                    className="text-xs h-8"
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveTemplate(setting)}
                  disabled={!canEdit || saving === setting.id}
                >
                  {saving === setting.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save Template
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Variables: {"{{title}}"}, {"{{market_id}}"}, {"{{resolved_side}}"}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default AimtellAutoBroadcast;
