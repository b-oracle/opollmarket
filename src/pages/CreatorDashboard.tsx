import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SEOHead from "@/components/SEOHead";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  CalendarIcon,
  X,
} from "lucide-react";
import ResolvedMarketDetail from "@/components/creator/ResolvedMarketDetail";

type RangePreset = "all" | "7d" | "30d" | "90d" | "ytd" | "custom";

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
  updated_at: string | null;
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
  const [rangePreset, setRangePreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Derive [from, to] window in UTC so boundaries are identical for every
  // client regardless of local timezone. `null` from = no lower bound.
  // - Day-aligned bounds (presets, custom range) snap to UTC midnight.
  // - Rolling presets (7d/30d/90d) anchor to today's UTC midnight - N days.
  // - YTD anchors to Jan 1 00:00:00 UTC of the current UTC year.
  const dateWindow = useMemo<{ from: Date | null; to: Date | null }>(() => {
    if (rangePreset === "all") return { from: null, to: null };

    const now = new Date();
    // Today at 00:00:00.000 UTC
    const utcTodayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const DAY_MS = 24 * 60 * 60 * 1000;
    // Inclusive end-of-today in UTC (23:59:59.999)
    const utcTodayEnd = new Date(utcTodayStart.getTime() + DAY_MS - 1);

    // Treat a user-picked calendar Date as that calendar day in UTC.
    const toUtcDayStart = (d: Date) =>
      new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

    if (rangePreset === "custom") {
      return {
        from: customFrom ? toUtcDayStart(customFrom) : null,
        to: customTo ? new Date(toUtcDayStart(customTo).getTime() + DAY_MS - 1) : null,
      };
    }

    if (rangePreset === "ytd") {
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        to: utcTodayEnd,
      };
    }

    const days = rangePreset === "7d" ? 7 : rangePreset === "30d" ? 30 : 90;
    return {
      // e.g. "Last 7 days" = the last 7 full UTC days including today
      from: new Date(utcTodayStart.getTime() - (days - 1) * DAY_MS),
      to: utcTodayEnd,
    };
  }, [rangePreset, customFrom, customTo]);

  const isCustomRangeIncomplete = rangePreset === "custom" && (!customFrom || !customTo);

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
          "id, title, status, image_url, volume, liquidity, initial_liquidity, participants, created_at, end_date, updated_at, resolved_side, winning_option_id, market_type",
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
      // Scoped by created_at within selected window (when set).
      const fromIso = dateWindow.from?.toISOString();
      const toIso = dateWindow.to?.toISOString();
      const applyWindow = (q: any) => {
        let next = q;
        if (fromIso) next = next.gte("created_at", fromIso);
        if (toIso) next = next.lte("created_at", toIso);
        return next;
      };

      // Single source of truth for creator commissions: `pending_commissions`
      // (rows are inserted as `pending` and updated to `released` when paid out;
      // matching `transactions` rows for the released payout would double-count).
      // Plus a fallback for legacy commissions that exist only in `transactions`
      // (older markets where pending_commissions wasn't yet wired up).
      const [pendingRes, legacyPaidRes, refundRes] = await Promise.all([
        applyWindow(
          supabase
            .from("pending_commissions" as any)
            .select("market_id, amount, status")
            .eq("user_id", user.id)
            .eq("type", "creator")
            .in("market_id", ids),
        ),
        applyWindow(
          supabase
            .from("transactions")
            .select("market_id, amount, created_at")
            .eq("user_id", user.id)
            .eq("type", "commission")
            .eq("side", "creator")
            .eq("status", "confirmed")
            .in("market_id", ids),
        ),
        applyWindow(
          supabase
            .from("transactions")
            .select("market_id, amount")
            .eq("user_id", user.id)
            .eq("type", "refund")
            .eq("side", "liquidity_return")
            .eq("status", "confirmed")
            .in("market_id", ids),
        ),
      ]);

      const map: EarningsByMarket = {};
      const ensure = (id: string) => (map[id] ||= { realized: 0, pending: 0, liquidityReturn: 0 });

      // Track which (market_id) have pending_commissions data so we don't
      // double-count legacy transactions for the same markets.
      const marketsWithPendingData = new Set<string>();

      ((pendingRes.data as any[]) || []).forEach((c) => {
        if (!c.market_id) return;
        marketsWithPendingData.add(c.market_id);
        const bucket = ensure(c.market_id);
        const amt = Number(c.amount) || 0;
        if (c.status === "released") bucket.realized += amt;
        else if (c.status === "pending") bucket.pending += amt;
      });

      // Legacy fallback: include `transactions` only for markets without
      // any pending_commissions rows (those have already been counted above).
      ((legacyPaidRes.data as any[]) || []).forEach((t) => {
        if (!t.market_id || marketsWithPendingData.has(t.market_id)) return;
        ensure(t.market_id).realized += Number(t.amount) || 0;
      });

      ((refundRes.data as any[]) || []).forEach((t) => {
        if (t.market_id) ensure(t.market_id).liquidityReturn += Number(t.amount) || 0;
      });

      if (!cancelled) {
        setEarningsByMarket(map);
        setLoading(false);
      }
    };

    // Skip fetching when user picked Custom but hasn't set both dates yet.
    if (!isCustomRangeIncomplete) load();
    return () => {
      cancelled = true;
    };
  }, [user, dateWindow.from?.getTime(), dateWindow.to?.getTime(), isCustomRangeIncomplete]);

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
      // Active Liquidity = creator's own contributed liquidity (initial_liquidity) for active markets only
      if (m.status === "active") liquidity += Number(m.initial_liquidity) || 0;
      if (m.status === "resolved") resolvedCount++;
      if (m.status === "active") activeCount++;
    }
    return { realized, pending, liquidityReturned, participants, liquidity, resolvedCount, activeCount };
  }, [markets, earningsByMarket]);

  const filtered = useMemo(() => {
    const fromMs = dateWindow.from?.getTime();
    const toMs = dateWindow.to?.getTime();
    return markets.filter((m) => {
      if (filter !== "all" && m.status !== filter) return false;
      // Apply date window only to resolved/cancelled markets (using updated_at as
      // the resolution timestamp proxy). Active/pending/draft markets are always shown.
      if ((m.status === "resolved" || m.status === "cancelled") && (fromMs || toMs)) {
        if (!m.updated_at) return false;
        const t = new Date(m.updated_at).getTime();
        if (fromMs && t < fromMs) return false;
        if (toMs && t > toMs) return false;
      }
      return true;
    });
  }, [markets, filter, dateWindow.from, dateWindow.to]);

  const rangeActive = rangePreset !== "all";

  const rangeLabel =
    rangePreset === "all"
      ? "All time"
      : rangePreset === "7d"
        ? "Last 7 days"
        : rangePreset === "30d"
          ? "Last 30 days"
          : rangePreset === "90d"
            ? "Last 90 days"
            : rangePreset === "ytd"
              ? "Year to date"
              : customFrom && customTo
                ? `${format(customFrom, "MMM d")} – ${format(customTo, "MMM d, yyyy")}`
                : "Pick dates";

  return (
    <div className="min-h-dvh bg-background pb-24">
      <SEOHead
        title="Creator Dashboard"
        description="Track markets you've created, current liquidity, participants, and earnings."
      />
      <TopBar />

      <main className="w-full max-w-none mx-0 px-3 sm:px-4 lg:px-6 pt-20 lg:pt-24">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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

        {/* Date range filter */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {([
            ["all", "All time"],
            ["7d", "7d"],
            ["30d", "30d"],
            ["90d", "90d"],
            ["ytd", "YTD"],
          ] as [RangePreset, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setRangePreset(key);
                if (key !== "custom") {
                  setCustomFrom(undefined);
                  setCustomTo(undefined);
                }
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                rangePreset === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={() => setRangePreset("custom")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                  rangePreset === "custom"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {rangePreset === "custom" && customFrom && customTo
                  ? `${format(customFrom, "MMM d")} – ${format(customTo, "MMM d")}`
                  : "Custom"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: customFrom, to: customTo }}
                onSelect={(range) => {
                  setCustomFrom(range?.from);
                  setCustomTo(range?.to);
                  setRangePreset("custom");
                  if (range?.from && range?.to) setCalendarOpen(false);
                }}
                numberOfMonths={1}
                disabled={(d) => d > new Date()}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          {rangeActive && (
            <button
              onClick={() => {
                setRangePreset("all");
                setCustomFrom(undefined);
                setCustomTo(undefined);
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground"
              aria-label="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Range summary */}
        <p className="text-[10px] text-muted-foreground mb-3">
          Earnings & resolved markets: <span className="font-semibold text-foreground">{rangeLabel}</span>
          <span className="ml-1 opacity-70">(UTC)</span>
          {isCustomRangeIncomplete && " • pick both start and end dates"}
        </p>

        {/* Status filters */}
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
            {markets.length === 0 ? (
              <>
                <p className="text-sm font-semibold mb-1">No markets yet</p>
                <p className="text-xs text-muted-foreground mb-4">Create your first market to start earning creator fees.</p>
                <button
                  onClick={() => navigate("/create")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                >
                  <PlusCircle className="w-4 h-4" /> Create Market
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold mb-1">No markets in this range</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Try a wider date range or clear the filter.
                </p>
                <button
                  onClick={() => {
                    setRangePreset("all");
                    setCustomFrom(undefined);
                    setCustomTo(undefined);
                    setFilter("all");
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted text-foreground text-xs font-semibold hover:bg-muted/70"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((m) => {
              const e = earningsByMarket[m.id] || { realized: 0, pending: 0, liquidityReturn: 0 };
              const totalEarned = e.realized + e.liquidityReturn;
              const isResolved = m.status === "resolved" || m.status === "cancelled";
              const isOpen = expanded.has(m.id);

              const cardInner = (
                <>
                  {m.image_url ? (
                    <img src={m.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold line-clamp-2">{m.title}</p>
                      {isResolved ? (
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
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
                </>
              );

              return (
                <li key={m.id}>
                  {isResolved ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(m.id)}
                        className="w-full flex gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors text-left"
                        aria-expanded={isOpen}
                      >
                        {cardInner}
                      </button>
                      {isOpen && user && (
                        <ResolvedMarketDetail
                          marketId={m.id}
                          userId={user.id}
                          resolvedSide={m.resolved_side}
                          winningOptionId={m.winning_option_id}
                          marketType={m.market_type}
                        />
                      )}
                      {isOpen && (
                        <div className="mt-2 flex justify-end">
                          <Link
                            to={`/market/${m.id}`}
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            Open market →
                          </Link>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={`/market/${m.id}`}
                      className="flex gap-3 p-3 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors"
                    >
                      {cardInner}
                    </Link>
                  )}
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
