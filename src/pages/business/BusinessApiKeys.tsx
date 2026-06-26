import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Copy, Trash2, RefreshCw, Key, Eye, EyeOff, Webhook, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useBusinessContext } from "./BusinessLayout";

interface ApiKey {
  id: string;
  partner_name: string;
  api_key: string;
  is_active: boolean;
  permissions: string[];
  rate_limit_per_min: number;
  webhook_url: string | null;
  webhook_secret: string | null;
  affiliate_commission_percent: number;
  created_at: string;
}

const PERMISSION_OPTIONS = ["read", "trade", "deposit"];

const generateKey = () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return "opoll_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
};

const API_ENDPOINTS = [
  { method: "GET", action: "markets", perm: "read", desc: "List markets with filtering" },
  { method: "GET", action: "market", perm: "read", desc: "Get single market details" },
  { method: "GET", action: "categories", perm: "read", desc: "List all categories" },
  { method: "GET", action: "trending", perm: "read", desc: "Trending markets by score" },
  { method: "GET", action: "search", perm: "read", desc: "Full-text search markets" },
  { method: "GET", action: "market-trades", perm: "read", desc: "Recent trades for a market" },
  { method: "GET", action: "balance", perm: "read", desc: "Authenticated user balance" },
  { method: "GET", action: "positions", perm: "read", desc: "Authenticated user positions" },
  { method: "GET", action: "trade-history", perm: "read", desc: "Authenticated user trade log" },
  { method: "POST", action: "place-bet", perm: "trade", desc: "Place a prediction" },
  { method: "POST", action: "sell-position", perm: "trade", desc: "Close/exit a position" },
  { method: "POST", action: "boost-market", perm: "trade", desc: "Boost market visibility" },
  { method: "POST", action: "create-market", perm: "trade", desc: "Create a market" },
  { method: "POST", action: "create-user", perm: "trade", desc: "Create a user account" },
  { method: "POST", action: "deposit", perm: "deposit", desc: "Get user's BSC deposit address (USDT BEP20)" },
  { method: "POST", action: "deposit-flutterwave", perm: "deposit", desc: "Initiate NGN deposit (Flutterwave)" },
  { method: "POST", action: "deposit-payaza", perm: "deposit", desc: "Initiate NGN deposit (Payaza)" },
  { method: "POST", action: "deposit-status", perm: "read", desc: "List recent BSC deposits & confirmations" },

  { method: "GET/POST", action: "webhooks", perm: "any", desc: "Manage webhook config" },
  { method: "GET", action: "comments", perm: "read", desc: "Read market comments" },
  { method: "POST", action: "comments", perm: "trade", desc: "Post a comment" },
  { method: "GET", action: "price-history", perm: "read", desc: "Historical price data" },
  { method: "GET", action: "embed-data", perm: "none", desc: "Public embed data (no key)" },
];

const BusinessApiKeys = () => {
  const { userId } = useBusinessContext();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["read"]);
  const [newWebhook, setNewWebhook] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null);
  const [webhookInput, setWebhookInput] = useState("");
  const [showEndpoints, setShowEndpoints] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_api_keys" as any);
    if (error) toast.error("Failed to load API keys");
    else setKeys(((data as any[]) || []).filter((k: any) => k.owner_id === userId));
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, [userId]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Enter a name for this API key"); return; }
    setCreating(true);
    const apiKey = generateKey();
    const { error } = await supabase.from("api_keys" as any).insert({
      partner_name: newName.trim(),
      api_key: apiKey,
      permissions: newPerms,
      owner_id: userId,
      webhook_url: newWebhook.trim() || null,
    } as any);
    if (error) toast.error(error.message);
    else {
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

  const maskKey = (key: string) => key.slice(0, 10) + "•".repeat(20) + key.slice(-4);

  const saveWebhook = async (keyId: string) => {
    const updates: Record<string, any> = { webhook_url: webhookInput.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("api_keys" as any).update(updates as any).eq("id", keyId);
    if (error) toast.error("Failed to update webhook");
    else {
      toast.success("Webhook updated");
      setEditingWebhook(null);
      fetchKeys();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">API Keys</h2>
          <p className="text-sm text-muted-foreground">Manage your API access keys and webhooks</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchKeys} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Available Endpoints Reference */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowEndpoints(!showEndpoints)}
          className="flex items-center justify-between w-full p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Available API Endpoints ({API_ENDPOINTS.length})</span>
          </div>
          {showEndpoints ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showEndpoints && (
          <div className="border-t border-border p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {API_ENDPOINTS.map((ep) => (
                <div key={ep.action} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-muted/50">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    ep.method === "GET" ? "bg-primary/10 text-primary" :
                    ep.method === "POST" ? "bg-amber-500/10 text-amber-500" :
                    "bg-violet-500/10 text-violet-500"
                  }`}>
                    {ep.method}
                  </span>
                  <code className="font-mono text-foreground shrink-0">{ep.action}</code>
                  <span className="text-muted-foreground truncate">— {ep.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              Permissions: <code className="text-foreground">read</code> for GET endpoints, <code className="text-foreground">trade</code> for trading/market actions, <code className="text-foreground">deposit</code> for deposits. User-scoped endpoints require a Bearer token.
            </p>

            {/* Deposit lifecycle & top-up flow */}
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-500">Crypto Deposit Flow (BSC native)</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <code className="text-foreground">deposit</code> returns the user's permanent BEP20 address. Send <strong>USDT (BEP20)</strong> on BNB Smart Chain to that address — any amount, any time. Deposits are auto-credited after 12 block confirmations (~40 seconds). Do not send other tokens or other networks; they will not be auto-credited.
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Poll <code className="text-foreground">deposit-status</code> (optionally filtered by <code className="text-foreground">tx_hash</code>) to watch each transfer. Statuses returned per deposit:
              </p>
              <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                <li><code className="text-foreground">detected</code> — on-chain transfer seen; waiting for 12 confirmations.</li>
                <li><code className="text-foreground">credited</code> — confirmed and added to the user's balance (<code className="text-foreground">transaction_id</code> populated).</li>
                <li><code className="text-foreground">manual_review</code> — flagged for staff review (amount thresholds / reorg / verification mismatch).</li>
              </ul>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The legacy NOWPayments invoice flow (with <code className="text-foreground">payment_id</code>, <code className="text-foreground">awaiting_topup</code>, partial-payment top-ups) has been retired. Existing partners should drop <code className="text-foreground">payment_id</code> from their integration and switch to address-based polling.
              </p>
            </div>

          </div>
        )}
      </div>

      {/* Create new key */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Create New Key</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Key name (e.g. My App)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="Webhook URL (optional)" value={newWebhook} onChange={(e) => setNewWebhook(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {PERMISSION_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => setNewPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                newPerms.includes(p) ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground"
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

      {/* Key list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No API keys yet. Create one above.</p>
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
                    <button onClick={() => setVisibleKeys(prev => { const n = new Set(prev); n.has(k.id) ? n.delete(k.id) : n.add(k.id); return n; })} className="p-0.5 hover:text-foreground">
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

                  {/* Webhook section */}
                  {editingWebhook === k.id ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={webhookInput}
                        onChange={(e) => setWebhookInput(e.target.value)}
                        placeholder="https://your-domain.com/webhook"
                        className="text-xs h-8 flex-1"
                      />
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => saveWebhook(k.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingWebhook(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Webhook className="w-3 h-3 text-muted-foreground" />
                      {k.webhook_url ? (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[250px]">{k.webhook_url}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50">No webhook configured</span>
                      )}
                      <button
                        onClick={() => { setEditingWebhook(k.id); setWebhookInput(k.webhook_url || ""); }}
                        className="text-[10px] text-primary hover:underline ml-1"
                      >
                        {k.webhook_url ? "Edit" : "Add"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={k.is_active} onCheckedChange={() => toggleActive(k.id, k.is_active)} />
                  <button onClick={() => deleteKey(k.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BusinessApiKeys;
