import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInHours } from "date-fns";
import { Megaphone, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import AdminPagination from "./AdminPagination";

interface BroadcastRow {
  id: string;
  market_id: string;
  user_id: string;
  amount: number;
  status: string;
  tier: string;
  tx_hash: string | null;
  nowpayments_payment_id: string | null;
  created_at: string;
  market_title?: string;
  user_name?: string;
  user_email?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  sent: "bg-green-500/10 text-green-500 border-green-500/20",
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  expired: "bg-muted text-muted-foreground border-border",
  payment_expired: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

function isPaid(b: BroadcastRow): boolean {
  return b.status === "sent" || b.status === "active" || (b.status === "expired" && !!(b.tx_hash || b.nowpayments_payment_id));
}

const PENDING_EXPIRY_HOURS = 2;

function getResolvedStatus(b: BroadcastRow): { display: string; key: string } {
  if (b.status === "sent" || b.status === "active") return { display: "Sent", key: "sent" };
  if (b.status === "expired") {
    return isPaid(b)
      ? { display: "Sent", key: "sent" }
      : { display: "Payment Expired", key: "payment_expired" };
  }
  if (b.status === "pending") {
    // Treat stale pending (>2h) as payment expired
    if (differenceInHours(new Date(), new Date(b.created_at)) >= PENDING_EXPIRY_HOURS) {
      return { display: "Payment Expired", key: "payment_expired" };
    }
    return { display: "Pending Payment", key: "pending" };
  }
  return { display: b.status, key: b.status };
}

type FilterKey = "all" | "sent" | "pending" | "payment_expired";

const AdminBroadcasts = () => {
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchBroadcasts = async () => {
    const { data, error } = await supabase
      .from("market_broadcasts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching broadcasts:", error);
      setLoading(false);
      return;
    }

    const rows = data || [];
    const marketIds = [...new Set(rows.map((b) => b.market_id))];
    const userIds = [...new Set(rows.map((b) => b.user_id))];

    const [marketsRes, profilesRes] = await Promise.all([
      supabase.from("markets").select("id, title").in("id", marketIds),
      supabase.rpc("admin_get_profiles_with_email", { _ids: userIds }),
    ]);

    const titleMap = new Map(marketsRes.data?.map((m) => [m.id, m.title]) || []);
    const profileMap = new Map(profilesRes.data?.map((p) => [p.id, p]) || []);

    setBroadcasts(
      rows.map((b) => ({
        ...b,
        market_title: titleMap.get(b.market_id) || "Unknown Market",
        user_name: profileMap.get(b.user_id)?.display_name || "Unknown",
        user_email: profileMap.get(b.user_id)?.email || "",
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const analytics = useMemo(() => {
    const sent = broadcasts.filter((b) => getResolvedStatus(b).key === "sent");
    const pending = broadcasts.filter((b) => getResolvedStatus(b).key === "pending");
    const expired = broadcasts.filter((b) => getResolvedStatus(b).key === "payment_expired");
    const totalRevenue = sent.reduce((s, b) => s + b.amount, 0);
    const lostRevenue = expired.reduce((s, b) => s + b.amount, 0);
    const convRate = broadcasts.length > 0 ? Math.round((sent.length / broadcasts.length) * 100) : 0;
    return { total: broadcasts.length, sent: sent.length, pending: pending.length, expired: expired.length, totalRevenue, lostRevenue, convRate };
  }, [broadcasts]);

  const filtered = useMemo(() => {
    if (filter === "all") return broadcasts;
    return broadcasts.filter((b) => getResolvedStatus(b).key === filter);
  }, [broadcasts, filter]);

  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => setPage(1), [filter]);

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All", count: analytics.total },
    { key: "sent", label: "Sent", count: analytics.sent },
    { key: "pending", label: "Pending", count: analytics.pending },
    { key: "payment_expired", label: "Payment Expired", count: analytics.expired },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold flex items-center gap-2">
        <Megaphone className="w-5 h-5 text-primary" />
        Broadcast Alerts
      </h3>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Total Broadcasts</span>
          <p className="text-xl font-bold">{analytics.total}</p>
          <p className="text-[9px] text-muted-foreground">{analytics.sent} sent · {analytics.pending} pending</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Broadcast Revenue</span>
          <p className="text-xl font-bold text-primary">${analytics.totalRevenue.toFixed(2)}</p>
          <p className="text-[9px] text-muted-foreground">{analytics.sent} paid alerts</p>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Lost Revenue</span>
          <p className="text-xl font-bold text-orange-500">${analytics.lostRevenue.toFixed(2)}</p>
          <p className="text-[9px] text-muted-foreground">{analytics.expired} unpaid</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium block mb-0.5">Conversion Rate</span>
          <p className="text-xl font-bold">{analytics.convRate}%</p>
          <p className="text-[9px] text-muted-foreground">initiated → paid</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              filter === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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

      {/* Broadcast List */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No broadcasts matching "{filters.find((f) => f.key === filter)?.label}"
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map((bc) => {
            const { display: statusDisplay, key: statusKey } = getResolvedStatus(bc);
            const isExpanded = expandedId === bc.id;

            return (
              <div key={bc.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : bc.id)}
                  className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Megaphone className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-sm font-bold truncate max-w-[300px]">{bc.market_title}</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColors[statusKey] || statusColors.expired}`}>
                        {statusDisplay}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="font-semibold">${bc.amount}</span>
                      <span>{bc.user_name}</span>
                      <span>{format(new Date(bc.created_at), "MMM d, HH:mm")}</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Broadcast ID</span>
                        <span className="font-mono text-foreground break-all">{bc.id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Market ID</span>
                        <span className="font-mono text-foreground break-all">{bc.market_id}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">User</span>
                        <span className="text-foreground">{bc.user_name}</span>
                        {bc.user_email && <span className="text-muted-foreground block text-[10px]">{bc.user_email}</span>}
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Amount</span>
                        <span className="text-foreground font-bold">${bc.amount.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Payment ID (NP)</span>
                        <span className="font-mono text-foreground">{bc.nowpayments_payment_id || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">TX Hash</span>
                        <span className="font-mono text-foreground break-all text-[10px]">{bc.tx_hash || (isPaid(bc) ? "Paid via balance" : "None (unpaid)")}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Status</span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusColors[statusKey]}`}>
                          {statusDisplay}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 font-medium">Created</span>
                        <span className="text-foreground">{format(new Date(bc.created_at), "MMM d, yyyy HH:mm:ss")}</span>
                      </div>
                    </div>

                    {/* Payment verdict */}
                    <div className={`mt-3 rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                      isPaid(bc)
                        ? "bg-green-500/5 border border-green-500/10"
                        : "bg-orange-500/5 border border-orange-500/10"
                    }`}>
                      {isPaid(bc) ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-green-500">Payment Confirmed</p>
                            <p className="text-muted-foreground">
                              This broadcast was paid for{bc.tx_hash ? " via crypto" : bc.nowpayments_payment_id ? " via crypto" : " via platform balance"} and the push notification was sent to all platform users.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-orange-500">Payment Not Received</p>
                            <p className="text-muted-foreground">User initiated this broadcast but never completed payment. No notification was sent.</p>
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

      <AdminPagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default AdminBroadcasts;
