import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Copy, Trash2, RefreshCw, Key, Eye, EyeOff } from "lucide-react";
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
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

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
    const { error } = await supabase.from("api_keys" as any).insert({
      partner_name: newName.trim(),
      api_key: apiKey,
      permissions: newPerms,
    } as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("API key created");
      setNewName("");
      setNewPerms(["read"]);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">API Keys</h2>
          <p className="text-sm text-muted-foreground">Manage partner API access</p>
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
            <div key={k.id} className="bg-card border border-border rounded-xl p-4">
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
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    <span>Permissions: {(k.permissions as string[]).join(", ")}</span>
                    <span>·</span>
                    <span>Rate: {k.rate_limit_per_min}/min</span>
                    <span>·</span>
                    <span>{new Date(k.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={k.is_active} onCheckedChange={() => toggleActive(k.id, k.is_active)} />
                    <button onClick={() => deleteKey(k.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
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
  
  // Get single market
  const { market } = await opoll.getMarket('MARKET_ID');
  
  // Embed a market widget
  opoll.embedMarket('MARKET_ID', '#widget-container');
</script>`}
          </pre>
          <p><strong>REST API Base URL:</strong></p>
          <code className="bg-muted/50 px-2 py-1 rounded text-[11px]">
            https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/api-public
          </code>
          <p><strong>Embed Widget:</strong></p>
          <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto text-[11px]">
{`<iframe src="https://opoll.org/embed/market/MARKET_ID" 
  width="400" height="320" frameborder="0" 
  style="border-radius:12px"></iframe>`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default AdminApiKeys;
