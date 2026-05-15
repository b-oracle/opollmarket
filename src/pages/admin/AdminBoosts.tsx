import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Zap, CheckCircle, XCircle, ChevronDown, ChevronUp, Timer, AlertTriangle, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/auditLog";
import { format, formatDistanceToNow, isPast, differenceInHours } from "date-fns";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminBroadcasts from "@/components/admin/AdminBroadcasts";
import { useAdminContext } from "./AdminLayout";

interface BoostRow {
  id: string;
  market_id: string;
  tier: string;
  amount: number;
  status: string;
  created_at: string;
  starts_at: string;
  ends_at: string;
  payer_wallet: string;
  tx_hash: string | null;
  nowpayments_payment_id: string | null;
  market_title?: string;
  payer_name?: string;
  payer_email?: string;
}

type FilterKey = "all" | "active" | "pending" | "boost_ended" | "payment_expired" | "cancelled";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  expired: "bg-muted text-muted-foreground border-border",
  boost_ended: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  payment_expired: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

const tierLabels: Record<string, string> = {
  flash: "⚡ Flash",
  standard: "🔥 Standard",
  whale: "👑 Whale",
};

const tierDurations: Record<string, string> = {
  flash: "12 hours",
  standard: "24 hours",
  whale: "7 days",
};

function getResolvedStatus(boost: BoostRow): { display: string; key: string } {
  if (boost.status === "expired") {
    return boost.tx_hash
      ? { display: "Boost Ended", key: "boost_ended" }
      : { display: "Payment Expired", key: "payment_expired" };
  }
  if (boost.status === "active") {
    // If ends_at has passed, treat as ended even though DB still says "active"
    if (isPast(new Date(boost.ends_at))) {
      return { display: "Boost Ended", key: "boost_ended" };
    }
    return { display: "Active", key: "active" };
  }
  if (boost.status === "pending") {
    // Treat stale pending (>2h) as payment expired
    if (differenceInHours(new Date(), new Date(boost.created_at)) >= 2) {
      return { display: "Payment Expired", key: "payment_expired" };
    }
    return { display: "Pending Payment", key: "pending" };
  }
  if (boost.status === "cancelled") {
    return { display: "Cancelled", key: "cancelled" };
  }
  return { display: boost.status, key: boost.status };
}

function ActiveCountdown({ endsAt }: { endsAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const end = new Date(endsAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return <span className="text-destructive text-xs font-bold">Expired</span>;

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return (
    <span className="flex items-center gap-1 text-xs font-mono font-bold text-green-500">
      <Timer className="w-3 h-3" />
      {h > 0 && `${h}h `}{m}m {s}s remaining
    </span>
  );
}


const AdminBoosts = () => {
  const { canEdit } = useAdminContext();
  const [boosts, setBoosts] = useState<BoostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"boosts" | "broadcasts">("boosts");
  const PAGE_SIZE = 15;

  const fetchBoosts = async () => {
    const { data, error } = await supabase
      .from("market_boosts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching boosts:", error);
      setLoading(false);
      return;
    }

    const rows = data || [];
    const marketIds = [...new Set(rows.map((b) => b.market_id))];
    const payerIds = [...new Set(rows.map((b) => b.payer_wallet))];

    const [marketsRes, profilesRes] = await Promise.all([
      supabase.from("markets").select("id, title").in("id", marketIds),
      supabase.rpc("admin_get_profiles_with_email", { _ids: payerIds }),
    ]);

    const titleMap = new Map(marketsRes.data?.map((m) => [m.id, m.title]) || []);
    const profileMap = new Map(profilesRes.data?.map((p) => [p.id, p]) || []);

    setBoosts(
      rows.map((b) => ({
        ...b,
        market_title: titleMap.get(b.market_id) || "Unknown Market",
        payer_name: profileMap.get(b.payer_wallet)?.display_name || "Unknown",
        payer_email: profileMap.get(b.payer_wallet)?.email || "",
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchBoosts();
  }, []);

  // Analytics
  const analytics = useMemo(() => {
    const active = boosts.filter((b) => getResolvedStatus(b).key === "active");
    const pending = boosts.filter((b) => getResolvedStatus(b).key === "pending");
    const boostEnded = boosts.filter((b) => getResolvedStatus(b).key === "boost_ended");
    const paymentExpired = boosts.filter((b) => getResolvedStatus(b).key === "payment_expired");
    const cancelled = boosts.filter((b) => getResolvedStatus(b).key === "cancelled");
    const paid = [...active, ...boostEnded];
    const totalRevenue = paid.reduce((s, b) => s + b.amount, 0);
    const lostRevenue = paymentExpired.reduce((s, b) => s + b.amount, 0);
    const conversionRate = boosts.length > 0 ? Math.round((paid.length / boosts.length) * 100) : 0;
    const tierBreakdown = { flash: 0, standard: 0, whale: 0 };
    for (const b of paid) tierBreakdown[b.tier as keyof typeof tierBreakdown] = (tierBreakdown[b.tier as keyof typeof tierBreakdown] || 0) + 1;

    return {
      total: boosts.length,
      active: active.length,
      pending: pending.length,
      boostEnded: boostEnded.length,
      paymentExpired: paymentExpired.length,
      cancelled: cancelled.length,
      totalRevenue,
      lostRevenue,
      conversionRate,
      tierBreakdown,
    };
  }, [boosts]);

  // Filter
  const filteredBoosts = useMemo(() => {
    if (filter === "all") return boosts;
    return boosts.filter((b) => {
      const { key } = getResolvedStatus(b);
      return key === filter;
    });
  }, [boosts, filter]);

  const paginatedBoosts = useMemo(
    () => filteredBoosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredBoosts, page]
  );

  // Reset page on filter change
  useEffect(() => setPage(1), [filter]);

  const handleActivate = async (boost: BoostRow) => {
    setActionLoading(boost.id);
    const durationHours: Record<string, number> = { flash: 12, standard: 24, whale: 168 };
    const hours = durationHours[boost.tier] || 24;
    const now = new Date();
    const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const { error } = await supabase
      .from("market_boosts")
      .update({ status: "active", starts_at: now.toISOString(), ends_at: endsAt.toISOString() })
      .eq("id", boost.id);

    if (error) {
      toast.error("Failed to activate boost");
    } else {
      toast.success("Boost activated");
      logAuditEvent({ action: "boost_activated", targetId: boost.id, targetType: "boost", details: { market_id: boost.market_id, tier: boost.tier } });
      fetchBoosts();
    }
    setActionLoading(null);
  };

  const handleCancel = async (boostId: string) => {
    setActionLoading(boostId);
    const boost = boosts.find((b) => b.id === boostId);
    const { error } = await supabase
      .from("market_boosts")
      .update({ status: "cancelled" })
      .eq("id", boostId);

    if (error) {
      toast.error("Failed to cancel boost");
    } else {
      toast.success("Boost cancelled");
      logAuditEvent({ action: "boost_cancelled", targetId: boostId, targetType: "boost", details: { market_id: boost?.market_id, tier: boost?.tier } });
      fetchBoosts();
    }
    setActionLoading(null);
  };

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: boosts.length },
    { key: "active", label: "Active", count: analytics.active },
    { key: "pending", label: "Pending", count: analytics.pending },
    { key: "boost_ended", label: "Ended", count: analytics.boostEnded },
    { key: "payment_expired", label: "Payment Expired", count: analytics.paymentExpired },
    { key: "cancelled", label: "Cancelled", count: analytics.cancelled },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Zap className="w-6 h-6 text-primary" />
        Promotions
      </h2>

      {/* Top-level Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("boosts")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "boosts" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="w-4 h-4" />
          Boosts
        </button>
        <button
          onClick={() => setActiveTab("broadcasts")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "broadcasts" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Megaphone className="w-4 h-4" />
          Broadcasts
        </button>
      </div>

      {activeTab === "broadcasts" ? (
        <AdminBroadcasts />
      ) : (
        <>
          {/* Analytics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Total Boosts</span>
              <p className="text-xl font-bold">{analytics.total}</p>
            </div>
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Active Now</span>
              <p className="text-xl font-bold text-green-500">{analytics.active}</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Revenue Earned</span>
              <p className="text-xl font-bold text-primary">${analytics.totalRevenue.toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground">{analytics.boostEnded + analytics.active} paid boosts</p>
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Lost Revenue</span>
              <p className="text-xl font-bold text-orange-500">${analytics.lostRevenue.toFixed(2)}</p>
              <p className="text-[9px] text-muted-foreground">{analytics.paymentExpired} unpaid</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Conversion Rate</span>
              <p className="text-xl font-bold">{analytics.conversionRate}%</p>
              <p className="text-[9px] text-muted-foreground">initiated → paid</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Tier Breakdown</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px]">⚡{analytics.tierBreakdown.flash}</span>
                <span className="text-[10px]">🔥{analytics.tierBreakdown.standard}</span>
                <span className="text-[10px]">👑{analytics.tierBreakdown.whale}</span>
              </div>
              <p className="text-[9px] text-muted-foreground">paid only</p>
            </div>
          </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              filter === f.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            {f.count > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold ${filter === f.key ? "text-primary" : "text-muted-foreground"}`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Boost List */}
      {filteredBoosts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No boosts matching "{filters.find((f) => f.key === filter)?.label}"
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedBoosts.map((boost) => {
            const { display: statusDisplay, key: statusKey } = getResolvedStatus(boost);
            const isExpanded = expandedId === boost.id;

            return (
              <div key={boost.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Main row — clickable */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : boost.id)}
                  className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold truncate max-w-[300px]">
                        {boost.market_title}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColors[statusKey] || statusColors.expired}`}>
                        {statusDisplay}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {tierLabels[boost.tier] || boost.tier}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="font-semibold">${boost.amount}</span>
                      <span>{boost.payer_name}</span>
                      <span>{format(new Date(boost.created_at), "MMM d, HH:mm")}</span>
                      {boost.status === "active" && <ActiveCountdown endsAt={boost.ends_at} />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canEdit && boost.status === "pending" && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); handleActivate(boost); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
                      >
                        {actionLoading === boost.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Approve
                      </span>
                    )}
                    {canEdit && (boost.status === "pending" || (boost.status === "active" && !isPast(new Date(boost.ends_at)))) && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); handleCancel(boost.id); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        {actionLoading === boost.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        Cancel
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Boost ID</span>
                        <span className="font-mono text-foreground break-all">{boost.id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Market ID</span>
                        <span className="font-mono text-foreground break-all">{boost.market_id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Payer</span>
                        <span className="text-foreground">{boost.payer_name}</span>
                        {boost.payer_email && <span className="text-muted-foreground block text-[10px]">{boost.payer_email}</span>}
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Payer Wallet ID</span>
                        <span className="font-mono text-foreground break-all text-[10px]">{boost.payer_wallet}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Tier / Duration</span>
                        <span className="text-foreground">{tierLabels[boost.tier] || boost.tier} — {tierDurations[boost.tier] || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Amount</span>
                        <span className="text-foreground font-bold">${boost.amount.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Payment ID (NP)</span>
                        <span className="font-mono text-foreground">{boost.nowpayments_payment_id || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">TX Hash</span>
                        <span className="font-mono text-foreground break-all text-[10px]">{boost.tx_hash || "None (unpaid)"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Status</span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusColors[statusKey]}`}>
                          {statusDisplay}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Created</span>
                        <span className="text-foreground">{format(new Date(boost.created_at), "MMM d, yyyy HH:mm:ss")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Boost Start</span>
                        <span className="text-foreground">{format(new Date(boost.starts_at), "MMM d, yyyy HH:mm:ss")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Boost End</span>
                        <span className="text-foreground">
                          {format(new Date(boost.ends_at), "MMM d, yyyy HH:mm:ss")}
                          {boost.status === "active" && !isPast(new Date(boost.ends_at)) && (
                            <span className="text-green-500 ml-1">
                              ({formatDistanceToNow(new Date(boost.ends_at))} left)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Payment verdict */}
                    <div className={`mt-3 rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                      boost.tx_hash
                        ? "bg-green-500/5 border border-green-500/10"
                        : "bg-orange-500/5 border border-orange-500/10"
                    }`}>
                      {(boost.tx_hash || (boost.nowpayments_payment_id && boost.status === "active")) ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-green-500">Payment Confirmed</p>
                            <p className="text-muted-foreground">This boost was paid for and the market was actively boosted for the {tierDurations[boost.tier] || "configured"} duration.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-orange-500">Payment Not Received</p>
                            <p className="text-muted-foreground">User initiated this boost but never completed the crypto payment. No funds were received and the market was never boosted.</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AdminPagination page={page} totalItems={filteredBoosts.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default AdminBoosts;
