import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Palette, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBusinessContext } from "./BusinessLayout";

interface BrandSettings {
  id: string;
  partner_name: string;
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_dark_bg: string | null;
}

const BusinessCustomization = () => {
  const { userId } = useBusinessContext();
  const [keys, setKeys] = useState<BrandSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Partial<BrandSettings>>>({});

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("api_keys" as any)
        .select("id, partner_name, brand_name, brand_logo_url, brand_primary_color, brand_dark_bg")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      setKeys((data as any[]) || []);
      setLoading(false);
    };
    fetch();
  }, [userId]);

  const handleSave = async (keyId: string) => {
    const changes = edits[keyId];
    if (!changes) return;
    setSaving(keyId);
    const { error } = await supabase.from("api_keys" as any).update(changes as any).eq("id", keyId);
    if (error) toast.error("Failed to save");
    else {
      toast.success("Brand settings saved");
      setEdits((prev) => { const n = { ...prev }; delete n[keyId]; return n; });
      // Refresh
      const { data } = await supabase
        .from("api_keys" as any)
        .select("id, partner_name, brand_name, brand_logo_url, brand_primary_color, brand_dark_bg")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      setKeys((data as any[]) || []);
    }
    setSaving(null);
  };

  const updateEdit = (keyId: string, field: string, value: string | null) => {
    setEdits((prev) => ({
      ...prev,
      [keyId]: { ...prev[keyId], [field]: value || null },
    }));
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (keys.length === 0) {
    return (
      <div className="text-center py-16">
        <Palette className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">Create an API key first to customize branding</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Brand Customization</h2>
        <p className="text-sm text-muted-foreground">White-label settings for your API keys</p>
      </div>

      {keys.map((k) => {
        const e = edits[k.id] || {};
        return (
          <div key={k.id} className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{k.partner_name}</h3>
              <Button size="sm" onClick={() => handleSave(k.id)} disabled={!edits[k.id] || saving === k.id}>
                {saving === k.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Brand Name</label>
                <Input
                  defaultValue={k.brand_name || ""}
                  placeholder="Your Brand"
                  onChange={(ev) => updateEdit(k.id, "brand_name", ev.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Logo URL</label>
                <Input
                  defaultValue={k.brand_logo_url || ""}
                  placeholder="https://..."
                  onChange={(ev) => updateEdit(k.id, "brand_logo_url", ev.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Primary Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    defaultValue={k.brand_primary_color || "#3b82f6"}
                    className="w-10 h-10 rounded cursor-pointer border border-border"
                    onChange={(ev) => updateEdit(k.id, "brand_primary_color", ev.target.value)}
                  />
                  <Input
                    defaultValue={k.brand_primary_color || "#3b82f6"}
                    className="flex-1"
                    onChange={(ev) => updateEdit(k.id, "brand_primary_color", ev.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Dark Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    defaultValue={k.brand_dark_bg || "#0a0a0f"}
                    className="w-10 h-10 rounded cursor-pointer border border-border"
                    onChange={(ev) => updateEdit(k.id, "brand_dark_bg", ev.target.value)}
                  />
                  <Input
                    defaultValue={k.brand_dark_bg || "#0a0a0f"}
                    className="flex-1"
                    onChange={(ev) => updateEdit(k.id, "brand_dark_bg", ev.target.value)}
                  />
                </div>
              </div>
            </div>
            {(k.brand_logo_url || e.brand_logo_url) && (
              <div className="border border-border/30 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground mb-2">Preview</p>
                <div className="flex items-center gap-2" style={{ backgroundColor: e.brand_dark_bg || k.brand_dark_bg || "#0a0a0f", padding: "12px", borderRadius: "8px" }}>
                  <img src={e.brand_logo_url || k.brand_logo_url || ""} alt="logo" className="w-8 h-8 rounded object-contain" />
                  <span style={{ color: e.brand_primary_color || k.brand_primary_color || "#3b82f6", fontWeight: 700 }}>
                    {e.brand_name || k.brand_name || k.partner_name}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BusinessCustomization;
