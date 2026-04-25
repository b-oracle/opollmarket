import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SEOHead from "@/components/SEOHead";
import {
  Loader2,
  BarChart3,
  Users,
  Droplets,
  DollarSign,
  TrendingUp,
  PlusCircle,
  ChevronRight,
  ChevronDown,
  Hourglass,
} from "lucide-react";
import ResolvedMarketDetail from "@/components/creator/ResolvedMarketDetail";

type MarketRow = {
  id: string;
  title: string;
  status: string;
  image_url: string | null;
  volume: number | null;
  liquidity: number | null;
  initial_liquidity: number | null;
  participants: number | null;
  created_at: string;
  end_date: string | null;
  resolved_at: string | null;
  resolved_side: string | null;
  winning_option_id: string | null;
  market_type: string | null;
};

type EarningsByMarket = Record<string, { realized: number; pending: number; liquidityReturn: number }>;

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    resolved: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    ended: "bg-violet-500/10 text-violet-500 border-violet-500/20",
    cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
    draft: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border capitalize ${map[status] || map.draft}`}>
      {status}
    </span>
  );
};

const CreatorDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [earningsByMarket, setEarningsByMarket] = useState<EarningsByMarket>({});
  const [filter, setFilter] = useState<"all" | "active" | "resolved" | "pending">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // Fetch markets created by this user
      const { data: marketsData } = await supabase
        .from("markets")
        .select(
          "id, title, status, image_url, volume, liquidity, initial_liquidity, participants, created_at, end_date, resolved_at, resolved_side, winning_option_id, market_type",
        )
        .eq("creator_wallet", user.id)
        .order("created_at", { ascending: false });

      const mList: MarketRow[] = (marketsData as any[]) || [];
      if (cancelled) return;
      setMarkets(mList);

      const ids = mList.map((m) => m.id);
      if (ids.length === 0) {
        setEarningsByMarket({});
        setLoading(false);
        return;
      }

      // Earnings: paid creator commissions + pending creator commissions + liquidity refunds
      const [paidRes, pendingRes, refundRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("market_id, amount")
          .eq("user_id", user.id)
          .eq("type", "commission")
          .eq("status", "confirmed")
          .in("market_id", ids),
        supabase
          .from("pending_commissions" as any)
          .select("market_id, amount, status")
          .eq("user_id", user.id)
          .eq("type", "creator")
          .in("market_id", ids),
        supabase
          .from("transactions")
          .select("market_id, amount")
          .eq("user_id", user.id)
          .eq("type", "refund")
          .eq("side", "liquidity_return")
          .eq("status", "confirmed")
          .in("market_id", ids),
      ]);

      const map: EarningsByMarket = {};
      const ensure = (id: string) => (map[id] ||= { realized: 0, pending: 0, liquidityReturn: 0 });

      ((paidRes.data as any[]) || []).forEach((t) => {
        if (t.market_id) ensure(t.market_id).realized += Number(t.amount) || 0;
      });
      ((pendingRes.data as any[]) || []).forEach((c) => {
        if (!c.market_id) return;
        const bucket = ensure(c.market_id);
        if (c.status === "released") bucket.realized += Number(c.amount) || 0;
        else if (c.status === "pending") bucket.pending += Number(c.amount) || 0;
      });
      ((refundRes.data as any[]) || []).forEach((t) => {
        if (t.market_id) ensure(t.market_id).liquidityReturn += Number(t.amount) || 0;
      });

      if (!cancelled) {
        setEarningsByMarket(map);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totals = useMemo(() => {
    let realized = 0;
    let pending = 0;
    let liquidityReturned = 0;
    let participants = 0;
    let liquidity = 0;
    let resolvedCount = 0;
    let activeCount = 0;
    for (const m of markets) {
      const e = earningsByMarket[m.id];
      if (e) {
        realized += e.realized;
        pending += e.pending;
        liquidityReturned += e.liquidityReturn;
      }
      participants += Number(m.participants) || 0;
      liquidity += Number(m.liquidity) || 0;
      if (m.status === "resolved") resolvedCount++;
      if (m.status === "active") activeCount++;
    }
    return { realized, pending, liquidityReturned, participants, liquidity, resolvedCount, activeCount };
  }, [markets, earningsByMarket]);

  const filtered = useMemo(() => {
    if (filter === "all") return markets;
    return markets.filter((m) => m.status === filter);
  }, [markets, filter]);

  return (
    <div className="min-h-dvh bg-background pb-24">
      <SEOHead
        title="Creator Dashboard"
        description="Track markets you've created, current liquidity, participants, and earnings."
      />
      <TopBar />

      <main className="max-w-3xl mx-auto px-4 pt-4 lg:pl-64">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold">Creator Dashboard</h1>
            <p className="text-xs text-muted-foreground">Markets you've created and their performance</p>
          </div>
          <button
            onClick={() => navigate("/create")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95 transition-transform"
          >
            <PlusCircle className="w-4 h-4" /> New Market
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total Earned" value={`$${totals.realized.toFixed(2)}`} icon={DollarSign} color="text-emerald-500" />
          <StatCard label="Pending Earnings" value={`$${totals.pending.toFixed(2)}`} icon={Hourglass} color="text-amber-500" />
          <StatCard label="Active Liquidity" value={`$${totals.liquidity.toFixed(2)}`} icon={Droplets} color="text-blue-500" />
          <StatCard label="Total Participants" value={totals.participants.toLocaleString()} icon={Users} color="text-violet-500" />
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Markets Created" value={String(markets.length)} icon={BarChart3} color="text-primary" small />
          <StatCard label="Active" value={String(totals.activeCount)} icon={TrendingUp} color="text-emerald-500" small />
          <StatCard label="Resolved" value={String(totals.resolvedCount)} icon={BarChart3} color="text-blue-500" small />
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(["all", "active", "pending", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold mb-1">No markets yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create your first market to start earning creator fees.</p>
            <button
              onClick={() => navigate("/create")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
            >
              <PlusCircle className="w-4 h-4" /> Create Market
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((m) => {
              const e = earningsByMarket[m.id] || { realized: 0, pending: 0, liquidityReturn: 0 };
              const totalEarned = e.realized + e.liquidityReturn;
              return (
                <li key={m.id}>
                  <Link
                    to={`/market/${m.id}`}
                    className="flex gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    {m.image_url ? (
                      <img src={m.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold line-clamp-2">{m.title}</p>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusBadge status={m.status} />
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <Metric label="Liquidity" value={`$${(Number(m.liquidity) || 0).toFixed(2)}`} />
                        <Metric label="Players" value={String(Number(m.participants) || 0)} />
                        <Metric
                          label="Earned"
                          value={`$${totalEarned.toFixed(2)}`}
                          accent={totalEarned > 0 ? "text-emerald-500" : undefined}
                          hint={e.pending > 0 ? `+$${e.pending.toFixed(2)} pending` : undefined}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

const StatCard = ({
  label,
  value,
  icon: Icon,
  color,
  small,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
  small?: boolean;
}) => (
  <div className={`bg-card border border-border rounded-xl ${small ? "p-2.5" : "p-3"}`}>
    <div className="flex items-center gap-1.5 mb-1">
      <Icon className={`${small ? "w-3.5 h-3.5" : "w-4 h-4"} ${color}`} />
      <p className={`${small ? "text-[10px]" : "text-[11px]"} text-muted-foreground font-medium`}>{label}</p>
    </div>
    <p className={`${small ? "text-sm" : "text-base"} font-bold`}>{value}</p>
  </div>
);

const Metric = ({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) => (
  <div className="min-w-0">
    <p className="text-[10px] text-muted-foreground">{label}</p>
    <p className={`font-semibold truncate ${accent || "text-foreground"}`}>{value}</p>
    {hint && <p className="text-[9px] text-amber-500 truncate">{hint}</p>}
  </div>
);

export default CreatorDashboard;
