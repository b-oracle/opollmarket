import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Copy, Trash2, RefreshCw, Key, Eye, EyeOff, Palette, Globe, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAdminContext } from "./AdminLayout";

interface ApiKey {
  id: string;
  partner_name: string;
  api_key: string;
  is_active: boolean;
  permissions: string[];
  rate_limit_per_min: number;
  webhook_url: string | null;
  affiliate_commission_percent: number;
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_dark_bg: string | null;
  created_at: string;
}

const PERMISSION_OPTIONS = ["read", "trade", "deposit", "all"];

const generateKey = () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return "opoll_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
};

const AdminApiKeys = () => {
  const { canEdit } = useAdminContext();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["read"]);
  const [newWebhook, setNewWebhook] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [editingBrand, setEditingBrand] = useState<string | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load API keys");
    } else {
      setKeys((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Enter a partner name"); return; }
    setCreating(true);
    const apiKey = generateKey();
    const insertData: any = {
      partner_name: newName.trim(),
      api_key: apiKey,
      permissions: newPerms,
    };
    if (newWebhook.trim()) insertData.webhook_url = newWebhook.trim();
    const { error } = await supabase.from("api_keys" as any).insert(insertData);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("API key created");
      setNewName("");
      setNewPerms(["read"]);
      setNewWebhook("");
      fetchKeys();
    }
    setCreating(false);
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await supabase.from("api_keys" as any).update({ is_active: !isActive } as any).eq("id", id);
    fetchKeys();
  };

  const deleteKey = async (id: string) => {
    if (!confirm("Delete this API key permanently?")) return;
    await supabase.from("api_keys" as any).delete().eq("id", id);
    toast.success("Deleted");
    fetchKeys();
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Copied to clipboard");
  };

  const toggleVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const maskKey = (key: string) => key.slice(0, 10) + "•".repeat(20) + key.slice(-4);

  const updateField = async (id: string, field: string, value: any) => {
    await supabase.from("api_keys" as any).update({ [field]: value } as any).eq("id", id);
    fetchKeys();
    toast.success("Updated");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">API Keys</h2>
          <p className="text-sm text-muted-foreground">Manage partner API access, webhooks & white-labeling</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchKeys}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Create new key */}
      {canEdit && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Create New Key</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Partner name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Webhook URL (optional)" value={newWebhook} onChange={(e) => setNewWebhook(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {PERMISSION_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() =>
                  setNewPerms((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                  )
                }
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  newPerms.includes(p)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button onClick={handleCreate} disabled={creating} size="sm">
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Key className="w-4 h-4 mr-1" />}
            Generate Key
          </Button>
        </div>
      )}

      {/* Key list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No API keys created yet</p>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{k.partner_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${k.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {k.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <span>{visibleKeys.has(k.id) ? k.api_key : maskKey(k.api_key)}</span>
                    <button onClick={() => toggleVisible(k.id)} className="p-0.5 hover:text-foreground">
                      {visibleKeys.has(k.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    <button onClick={() => copyKey(k.api_key)} className="p-0.5 hover:text-foreground">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    <span>Permissions: {(k.permissions as string[]).join(", ")}</span>
                    <span>·</span>
                    <span>Rate: {k.rate_limit_per_min}/min</span>
                    <span>·</span>
                    <span>Commission: {k.affiliate_commission_percent}%</span>
                    <span>·</span>
                    <span>{new Date(k.created_at).toLocaleDateString()}</span>
                  </div>
                  {k.webhook_url && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Webhook className="w-3 h-3" />
                      <span className="truncate max-w-[250px]">{k.webhook_url}</span>
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setEditingBrand(editingBrand === k.id ? null : k.id)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title="White-label settings">
                      <Palette className="w-4 h-4" />
                    </button>
                    <Switch checked={k.is_active} onCheckedChange={() => toggleActive(k.id, k.is_active)} />
                    <button onClick={() => deleteKey(k.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Expandable white-label + webhook settings */}
              {editingBrand === k.id && canEdit && (
                <div className="border-t border-border/30 pt-3 space-y-3">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" /> White-Label & Webhook Settings</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Brand Name</label>
                      <Input
                        defaultValue={k.brand_name || ""}
                        placeholder="OPOLL"
                        className="h-8 text-xs"
                        onBlur={(e) => updateField(k.id, "brand_name", e.target.value || null)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Brand Logo URL</label>
                      <Input
                        defaultValue={k.brand_logo_url || ""}
                        placeholder="https://..."
                        className="h-8 text-xs"
                        onBlur={(e) => updateField(k.id, "brand_logo_url", e.target.value || null)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Primary Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          defaultValue={k.brand_primary_color || "#3b82f6"}
                          className="w-8 h-8 rounded cursor-pointer"
                          onBlur={(e) => updateField(k.id, "brand_primary_color", e.target.value)}
                        />
                        <Input
                          defaultValue={k.brand_primary_color || "#3b82f6"}
                          className="h-8 text-xs flex-1"
                          onBlur={(e) => updateField(k.id, "brand_primary_color", e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Dark Background</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          defaultValue={k.brand_dark_bg || "#0a0a0f"}
                          className="w-8 h-8 rounded cursor-pointer"
                          onBlur={(e) => updateField(k.id, "brand_dark_bg", e.target.value)}
                        />
                        <Input
                          defaultValue={k.brand_dark_bg || "#0a0a0f"}
                          className="h-8 text-xs flex-1"
                          onBlur={(e) => updateField(k.id, "brand_dark_bg", e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Webhook URL</label>
                      <Input
                        defaultValue={k.webhook_url || ""}
                        placeholder="https://your-server.com/webhook"
                        className="h-8 text-xs"
                        onBlur={(e) => updateField(k.id, "webhook_url", e.target.value || null)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Affiliate Commission %</label>
                      <Input
                        type="number"
                        defaultValue={k.affiliate_commission_percent}
                        min={0}
                        max={50}
                        className="h-8 text-xs"
                        onBlur={(e) => updateField(k.id, "affiliate_commission_percent", parseFloat(e.target.value) || 5)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SDK Documentation */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">SDK & API Documentation</h3>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p><strong>JavaScript SDK:</strong></p>
          <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto text-[11px]">
{`<script src="https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/sdk-js"></script>
<script>
  const opoll = new OPOLL({ apiKey: 'YOUR_API_KEY' });
  
  // List markets
  const { markets } = await opoll.getMarkets({ category: 'crypto', limit: 10 });
  
  // Embed a market widget
  opoll.embedMarket('MARKET_ID', '#widget-container');
</script>`}
          </pre>
          <p><strong>Embed Widget (with white-label):</strong></p>
          <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto text-[11px]">
{`<iframe src="https://opoll.org/embed/market/MARKET_ID?key=YOUR_API_KEY" 
  width="400" height="320" frameborder="0" 
  style="border-radius:12px"></iframe>`}
          </pre>
          <p><strong>Market Ticker:</strong></p>
          <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto text-[11px]">
{`<iframe src="https://opoll.org/embed/ticker?limit=10" 
  width="100%" height="56" frameborder="0" 
  style="border-radius:8px"></iframe>`}
          </pre>
          <p><strong>WordPress Plugin:</strong></p>
          <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto text-[11px]">
{`Download: https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/wp-plugin

Shortcodes:
  [opoll market="MARKET_ID"]
  [opoll_ticker limit="5"]
  [opoll_sdk api_key="YOUR_KEY"]`}
          </pre>
          <p><strong>Webhook Events:</strong></p>
          <div className="bg-muted/50 p-3 rounded-lg text-[11px] space-y-1">
            <p>• <code>market.resolved</code> — Fired when a market is resolved with winner info</p>
            <p>• Events POST to your configured webhook URL with JSON payload</p>
            <p>• Header <code>X-OPOLL-Event</code> contains the event type</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminApiKeys;
