import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Plus, Copy, Trash2, RefreshCw, Key, Eye, EyeOff,
  Palette, Webhook, Activity, BarChart3, Users, ChevronDown, ChevronUp,
  Globe, Clock, CheckCircle2, XCircle, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAdminContext } from "./AdminLayout";
import { format, formatDistanceToNow } from "date-fns";
import { KeyUsageChart } from "@/components/admin/KeyUsageChart";
import { getAvatarInitials } from "@/lib/utils";

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
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_dark_bg: string | null;
  owner_id: string | null;
  created_at: string;
}

interface OwnerProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface RequestStats {
  api_key_id: string;
  total: number;
  last_used: string | null;
  last_24h: number;
  last_7d: number;
  top_endpoints: { endpoint: string; count: number }[];
}

interface WebhookStats {
  api_key_id: string;
  total: number;
  delivered: number;
  failed: number;
}

interface WebhookEvent {
  id: string;
  api_key_id: string;
  event_type: string;
  status: string;
  response_code: number | null;
  attempts: number;
  created_at: string;
}

const PERMISSION_OPTIONS = ["read", "trade", "deposit", "all"];

const generateKey = () => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return "opoll_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
};

/* ─── Summary Card ─── */
const SummaryCard = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) => (
  <div className="bg-card border border-border rounded-xl p-4 space-y-1">
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="w-4 h-4" />
      <span className="text-xs font-medium">{label}</span>
    </div>
    <p className="text-2xl font-bold">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
  </div>
);

const AdminApiKeys = () => {
  const { canEdit } = useAdminContext();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [owners, setOwners] = useState<Map<string, OwnerProfile>>(new Map());
  const [requestStats, setRequestStats] = useState<Map<string, RequestStats>>(new Map());
  const [keyLogs, setKeyLogs] = useState<Map<string, { endpoint: string; created_at: string }[]>>(new Map());
  const [webhookStats, setWebhookStats] = useState<Map<string, WebhookStats>>(new Map());
  const [recentWebhooks, setRecentWebhooks] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["read"]);
  const [newWebhook, setNewWebhook] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [expandedAnalytics, setExpandedAnalytics] = useState<Set<string>>(new Set());
  const [expandedWebhooks, setExpandedWebhooks] = useState<Set<string>>(new Set());

  const fetchAll = async () => {
    setLoading(true);
    const now = new Date();
    const _24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const _7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch keys
    const { data: keysData } = await supabase
      .from("api_keys" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const allKeys = (keysData as any[] || []) as ApiKey[];
    setKeys(allKeys);

    // Fetch owner profiles
    const ownerIds = [...new Set(allKeys.map(k => k.owner_id).filter(Boolean))] as string[];
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ownerIds);
      const map = new Map<string, OwnerProfile>();
      (profiles || []).forEach((p: any) => map.set(p.id, p));
      setOwners(map);
    }

    // Fetch request logs — paginate to bypass the 1000-row default cap
    const logArr: any[] = [];
    const PAGE = 1000;
    const MAX_PAGES = 50; // safety cap = 50k rows
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE;
      const to = from + PAGE - 1;
      const { data: chunk, error } = await supabase
        .from("api_request_logs" as any)
        .select("api_key_id, endpoint, created_at")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) break;
      const arr = (chunk as any[]) || [];
      logArr.push(...arr);
      if (arr.length < PAGE) break;
    }
    
    // Aggregate per key
    const statsMap = new Map<string, RequestStats>();
    for (const log of logArr) {
      if (!statsMap.has(log.api_key_id)) {
        statsMap.set(log.api_key_id, {
          api_key_id: log.api_key_id,
          total: 0,
          last_used: null,
          last_24h: 0,
          last_7d: 0,
          top_endpoints: [],
        });
      }
      const s = statsMap.get(log.api_key_id)!;
      s.total++;
      if (!s.last_used || log.created_at > s.last_used) s.last_used = log.created_at;
      if (log.created_at >= _24h) s.last_24h++;
      if (log.created_at >= _7d) s.last_7d++;
    }
    // Compute top endpoints
    for (const [keyId, stat] of statsMap) {
      const endpointCount = new Map<string, number>();
      for (const log of logArr.filter(l => l.api_key_id === keyId)) {
        endpointCount.set(log.endpoint, (endpointCount.get(log.endpoint) || 0) + 1);
      }
      stat.top_endpoints = [...endpointCount.entries()]
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }
    setRequestStats(statsMap);

    // Per-key raw log buckets for charting
    const perKey = new Map<string, { endpoint: string; created_at: string }[]>();
    for (const log of logArr) {
      if (!perKey.has(log.api_key_id)) perKey.set(log.api_key_id, []);
      perKey.get(log.api_key_id)!.push({ endpoint: log.endpoint, created_at: log.created_at });
    }
    setKeyLogs(perKey);

    // Fetch webhook events
    const { data: whEvents } = await supabase
      .from("webhook_events" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    const whArr = (whEvents as any[] || []) as WebhookEvent[];
    setRecentWebhooks(whArr);

    // Aggregate webhook stats
    const whMap = new Map<string, WebhookStats>();
    for (const ev of whArr) {
      if (!whMap.has(ev.api_key_id)) {
        whMap.set(ev.api_key_id, { api_key_id: ev.api_key_id, total: 0, delivered: 0, failed: 0 });
      }
      const ws = whMap.get(ev.api_key_id)!;
      ws.total++;
      if (ev.status === "delivered") ws.delivered++;
      else if (ev.status === "failed") ws.failed++;
    }
    setWebhookStats(whMap);

    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Enter a partner name"); return; }
    setCreating(true);
    const apiKey = generateKey();
    const insertData: any = { partner_name: newName.trim(), api_key: apiKey, permissions: newPerms };
    if (newWebhook.trim()) insertData.webhook_url = newWebhook.trim();
    const { error } = await supabase.from("api_keys" as any).insert(insertData);
    if (error) toast.error(error.message);
    else {
      toast.success("API key created");
      setNewName(""); setNewPerms(["read"]); setNewWebhook("");
      fetchAll();
    }
    setCreating(false);
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await supabase.from("api_keys" as any).update({ is_active: !isActive } as any).eq("id", id);
    fetchAll();
  };

  const deleteKey = async (id: string) => {
    if (!confirm("Delete this API key permanently?")) return;
    await supabase.from("api_keys" as any).delete().eq("id", id);
    toast.success("Deleted");
    fetchAll();
  };

  const copyKey = (key: string) => { navigator.clipboard.writeText(key); toast.success("Copied"); };
  const toggleVisible = (id: string) => setVisibleKeys(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const maskKey = (key: string) => key.slice(0, 10) + "•".repeat(20) + key.slice(-4);
  const updateField = async (id: string, field: string, value: any) => {
    await supabase.from("api_keys" as any).update({ [field]: value } as any).eq("id", id);
    fetchAll();
    toast.success("Updated");
  };

  const toggleSection = (set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setFn(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // Summary stats
  const totalRequests = useMemo(() => [...requestStats.values()].reduce((s, r) => s + r.total, 0), [requestStats]);
  const totalWebhooks = useMemo(() => [...webhookStats.values()].reduce((s, w) => s + w.total, 0), [webhookStats]);
  const activeKeys = keys.filter(k => k.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">API Keys & Analytics</h2>
          <p className="text-sm text-muted-foreground">Manage partner access, monitor usage & webhooks</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Key} label="Total Keys" value={keys.length} sub={`${activeKeys} active`} />
        <SummaryCard icon={Users} label="Active Keys" value={activeKeys} sub={`${keys.length - activeKeys} inactive`} />
        <SummaryCard icon={Activity} label="API Requests" value={totalRequests.toLocaleString()} sub="All time" />
        <SummaryCard icon={Webhook} label="Webhook Events" value={totalWebhooks.toLocaleString()} sub="Last 500 events" />
      </div>

      {/* Create new key */}
      {canEdit && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Create New Key</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Partner name" value={newName} onChange={e => setNewName(e.target.value)} />
            <Input placeholder="Webhook URL (optional)" value={newWebhook} onChange={e => setNewWebhook(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {PERMISSION_OPTIONS.map(p => (
              <button
                key={p}
                onClick={() => setNewPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  newPerms.includes(p) ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground"
                }`}
              >{p}</button>
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
        <div className="space-y-4">
          {keys.map(k => {
            const owner = k.owner_id ? owners.get(k.owner_id) : null;
            const rs = requestStats.get(k.id);
            const ws = webhookStats.get(k.id);
            const keyWebhooks = recentWebhooks.filter(e => e.api_key_id === k.id).slice(0, 20);

            return (
              <div key={k.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Key header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {owner && (
                          <Avatar className="w-6 h-6">
                            <AvatarImage src={owner.avatar_url || undefined} />
                            <AvatarFallback className="text-[10px] bg-primary/20 text-primary font-bold">{getAvatarInitials(owner.display_name, { maxChars: 2 })}</AvatarFallback>
                          </Avatar>
                        )}
                        <span className="font-semibold text-sm">{k.partner_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${k.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                          {k.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {owner && (
                        <p className="text-[10px] text-muted-foreground ml-8 -mt-0.5">Owner: {owner.display_name || "Unknown"}</p>
                      )}
                      <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground mt-1">
                        <span>{visibleKeys.has(k.id) ? k.api_key : maskKey(k.api_key)}</span>
                        <button onClick={() => toggleVisible(k.id)} className="p-0.5 hover:text-foreground">
                          {visibleKeys.has(k.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                        <button onClick={() => copyKey(k.api_key)} className="p-0.5 hover:text-foreground">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span>Perms: {(k.permissions as string[]).join(", ")}</span>
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

                  {/* Quick stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Total Requests</p>
                      <p className="text-sm font-bold">{rs?.total.toLocaleString() || 0}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Last 24h</p>
                      <p className="text-sm font-bold">{rs?.last_24h.toLocaleString() || 0}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Last 7d</p>
                      <p className="text-sm font-bold">{rs?.last_7d.toLocaleString() || 0}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Webhooks</p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold">{ws?.total || 0}</p>
                        {ws && ws.failed > 0 && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-destructive/10 text-destructive font-medium">{ws.failed} failed</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Last used */}
                  {rs?.last_used && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last used {formatDistanceToNow(new Date(rs.last_used), { addSuffix: true })}
                    </p>
                  )}

                  {/* Expand buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleSection(expandedAnalytics, setExpandedAnalytics, k.id)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <BarChart3 className="w-3 h-3" />
                      Endpoints
                      {expandedAnalytics.has(k.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {k.webhook_url && (
                      <button
                        onClick={() => toggleSection(expandedWebhooks, setExpandedWebhooks, k.id)}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <Webhook className="w-3 h-3" />
                        Webhook Log
                        {expandedWebhooks.has(k.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded: Usage Analytics */}
                {expandedAnalytics.has(k.id) && (
                  <div className="border-t border-border/30 px-4 py-3 space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" /> Requests Over Time
                      </h4>
                      <KeyUsageChart logs={keyLogs.get(k.id) || []} />
                    </div>
                    <div className="space-y-2 pt-2 border-t border-border/30">
                      <h4 className="text-xs font-semibold flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Top Endpoints</h4>
                    {rs?.top_endpoints.length ? (
                      <div className="space-y-1.5">
                        {rs.top_endpoints.map(ep => {
                          const pct = rs.total > 0 ? (ep.count / rs.total) * 100 : 0;
                          return (
                            <div key={ep.endpoint} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground w-28 truncate font-mono text-[11px]">{ep.endpoint}</span>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-muted-foreground tabular-nums w-12 text-right">{ep.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No requests yet</p>
                    )}
                    </div>
                  </div>
                )}

                {/* Expanded: Webhook Event Log */}
                {expandedWebhooks.has(k.id) && (
                  <div className="border-t border-border/30 px-4 py-3 space-y-2">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5">
                      <Webhook className="w-3.5 h-3.5" /> Recent Webhook Events
                      {ws && (
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">
                          ({ws.delivered} delivered · {ws.failed} failed)
                        </span>
                      )}
                    </h4>
                    {keyWebhooks.length > 0 ? (
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {keyWebhooks.map(ev => (
                          <div key={ev.id} className="flex items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-muted/30">
                            {ev.status === "delivered" ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : ev.status === "failed" ? (
                              <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                            )}
                            <span className="font-mono text-muted-foreground">{ev.event_type}</span>
                            <span className="text-muted-foreground">·</span>
                            {ev.response_code && (
                              <span className={`font-mono ${ev.response_code >= 200 && ev.response_code < 300 ? "text-emerald-500" : "text-destructive"}`}>
                                {ev.response_code}
                              </span>
                            )}
                            <span className="ml-auto text-muted-foreground text-[10px]">
                              {format(new Date(ev.created_at), "MMM d, HH:mm")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No webhook events</p>
                    )}
                  </div>
                )}

                {/* Expandable white-label settings */}
                {editingBrand === k.id && canEdit && (
                  <div className="border-t border-border/30 px-4 py-3 space-y-3">
                    <h4 className="text-xs font-semibold flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" /> White-Label & Webhook</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Brand Name</label>
                        <Input defaultValue={k.brand_name || ""} placeholder="OPollmarket" className="h-8 text-xs" onBlur={e => updateField(k.id, "brand_name", e.target.value || null)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Brand Logo URL</label>
                        <Input defaultValue={k.brand_logo_url || ""} placeholder="https://..." className="h-8 text-xs" onBlur={e => updateField(k.id, "brand_logo_url", e.target.value || null)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Primary Color</label>
                        <div className="flex gap-2">
                          <input type="color" defaultValue={k.brand_primary_color || "#3b82f6"} className="w-8 h-8 rounded cursor-pointer" onBlur={e => updateField(k.id, "brand_primary_color", e.target.value)} />
                          <Input defaultValue={k.brand_primary_color || "#3b82f6"} className="h-8 text-xs flex-1" onBlur={e => updateField(k.id, "brand_primary_color", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Dark Background</label>
                        <div className="flex gap-2">
                          <input type="color" defaultValue={k.brand_dark_bg || "#0a0a0f"} className="w-8 h-8 rounded cursor-pointer" onBlur={e => updateField(k.id, "brand_dark_bg", e.target.value)} />
                          <Input defaultValue={k.brand_dark_bg || "#0a0a0f"} className="h-8 text-xs flex-1" onBlur={e => updateField(k.id, "brand_dark_bg", e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Webhook URL</label>
                        <Input defaultValue={k.webhook_url || ""} placeholder="https://your-server.com/webhook" className="h-8 text-xs" onBlur={e => updateField(k.id, "webhook_url", e.target.value || null)} />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Webhook Secret (HMAC)</label>
                        <div className="flex gap-2">
                          <Input defaultValue={k.webhook_secret || ""} placeholder="Auto-generated" className="h-8 text-xs flex-1" onBlur={e => updateField(k.id, "webhook_secret", e.target.value || null)} />
                          <Button size="sm" variant="outline" className="h-8 text-[10px] px-2" onClick={() => {
                            const secret = "whsec_" + Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
                            updateField(k.id, "webhook_secret", secret);
                            navigator.clipboard.writeText(secret);
                            toast.success("Secret generated & copied");
                          }}>Generate</Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Affiliate Commission %</label>
                        <Input type="number" defaultValue={k.affiliate_commission_percent} min={0} max={50} className="h-8 text-xs" onBlur={e => updateField(k.id, "affiliate_commission_percent", parseFloat(e.target.value) || 5)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
  const opoll = new OPollmarket({ apiKey: 'YOUR_API_KEY' });
  const { markets } = await opoll.getMarkets({ category: 'crypto', limit: 10 });
  opoll.embedMarket('MARKET_ID', '#widget-container');
</script>`}
          </pre>
          <p><strong>Embed Widget:</strong></p>
          <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto text-[11px]">
{`<iframe src="https://opoll.org/embed/market/MARKET_ID?key=YOUR_API_KEY" 
  width="400" height="320" frameborder="0" 
  style="border-radius:12px"></iframe>`}
          </pre>
          <p><strong>Webhook Events:</strong></p>
          <div className="bg-muted/50 p-3 rounded-lg text-[11px] space-y-1">
            <p>• <code>market.resolved</code> — Market resolved with winner</p>
            <p>• Header <code>X-OPollmarket-Event</code> contains event type</p>
            <p>• Signed with HMAC-SHA256 via <code>X-OPollmarket-Signature</code></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminApiKeys;
