import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { ArrowLeft, TrendingUp, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BetModal from "@/components/BetModal";
import LogoLoader from "@/components/LogoLoader";
import BottomNav from "@/components/BottomNav";
import SEOHead from "@/components/SEOHead";
import { useEventPriceHistory, TimePeriod } from "@/hooks/useEventPriceHistory";

const PERIODS: TimePeriod[] = ["1D", "1W", "1M", "All"];

function formatUsd(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const EventDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<TimePeriod>("All");
  const [betOpen, setBetOpen] = useState(false);
  const [betSide, setBetSide] = useState<"yes" | "no">("yes");
  const [activeMember, setActiveMember] = useState<any>(null);

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["event", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_events" as any)
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      return data as any;
    },
    enabled: !!slug,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["event-members", event?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_event_members" as any)
        .select(`
          market_id, display_label, icon_url, color, sort_order,
          market:markets!inner(id, title, yes_price, no_price, volume, status, image_url, end_date)
        `)
        .eq("event_id", event.id)
        .order("sort_order", { ascending: true });
      return (data || []) as any[];
    },
    enabled: !!event?.id,
  });

  const { series, chartData, isLoading: histLoading } = useEventPriceHistory(
    members as any,
    period
  );

  const totalVolume = useMemo(
    () => members.reduce((acc, m: any) => acc + Number(m.market?.volume || 0), 0),
    [members]
  );

  const sortedMembers = useMemo(
    () =>
      [...members].sort(
        (a: any, b: any) =>
          Number(b.market?.yes_price || 0) - Number(a.market?.yes_price || 0)
      ),
    [members]
  );

  const topSeries = useMemo(
    () => [...series].sort((a, b) => b.currentYes - a.currentYes).slice(0, 4),
    [series]
  );
  const lastIndex = chartData.length - 1;

  if (eventLoading || membersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LogoLoader />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-8">
        <p className="text-muted-foreground">Event not found</p>
        <Link to="/" className="text-primary text-sm">Go home</Link>
      </div>
    );
  }

  const openBet = (member: any, side: "yes" | "no") => {
    setActiveMember(member);
    setBetSide(side);
    setBetOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-[calc(var(--content-bottom)+5rem)]">
      <SEOHead
        title={`${event.title} — OPollmarket`}
        description={event.description || `Predict outcomes for ${event.title}`}
        image={event.image_url || undefined}
      />

      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            {event.image_url && (
              <img src={event.image_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-base truncate">{event.title}</h1>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <TrendingUp className="w-3 h-3" />
                <span>{formatUsd(totalVolume)} Vol.</span>
                {event.end_date && (
                  <>
                    <span>•</span>
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(event.end_date).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-5">
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {topSeries.map((s) => (
            <div key={s.marketId} className="flex items-center gap-1.5 text-sm">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-bold tabular-nums">{s.currentYes}%</span>
            </div>
          ))}
        </div>

        {/* Overlaid Chart */}
        <div className="h-[280px] -mx-1">
          {histLoading ? (
            <div className="h-full flex items-center justify-center">
              <LogoLoader />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No price history yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => `${v}%`}
                />
                {series.map((s) => (
                  <Line
                    key={s.marketId}
                    type="monotone"
                    dataKey={s.marketId}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Period selector */}
        <div className="flex items-center justify-center gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                period === p
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "All" ? "MAX" : p}
            </button>
          ))}
        </div>

        {/* Outcomes list */}
        <div className="space-y-2">
          {sortedMembers.map((m: any, idx: number) => {
            const yes = Math.round(Number(m.market?.yes_price || 0) * 100);
            const no = 100 - yes;
            const color = m.color || series.find((s) => s.marketId === m.market_id)?.color;
            return (
              <div
                key={m.market_id}
                className="bg-card border border-border rounded-xl p-3"
              >
                <Link
                  to={`/market/${m.market_id}`}
                  className="flex items-center justify-between gap-3 mb-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {m.market?.image_url || m.icon_url ? (
                      <img
                        src={m.market?.image_url || m.icon_url}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center bg-muted text-[10px] font-bold text-muted-foreground"
                      >
                        {(m.display_label || m.market?.title || "?").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: color }}
                        />
                        <div className="font-bold text-sm truncate">
                          {m.display_label || m.market?.title}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatUsd(Number(m.market?.volume || 0))} Vol.
                      </div>
                    </div>
                  </div>
                  <div className="text-xl font-bold tabular-nums">{yes}%</div>
                </Link>
                <div className="flex gap-2">
                  <button
                    onClick={() => openBet(m, "yes")}
                    className="flex-1 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-bold active:scale-95 transition"
                  >
                    Buy Yes {yes}¢
                  </button>
                  <button
                    onClick={() => openBet(m, "no")}
                    className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-bold active:scale-95 transition"
                  >
                    Buy No {no}¢
                  </button>
                </div>
              </div>
            );
          })}
          {sortedMembers.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No outcomes added yet
            </p>
          )}
        </div>

        {event.description && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="font-bold text-sm mb-2">About</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {event.description}
            </p>
          </div>
        )}
      </div>

      {activeMember && (
        <BetModal
          open={betOpen}
          onClose={() => setBetOpen(false)}
          side={betSide}
          price={
            betSide === "yes"
              ? Math.round(Number(activeMember.market?.yes_price || 0) * 100)
              : 100 - Math.round(Number(activeMember.market?.yes_price || 0) * 100)
          }
          marketTitle={`${event.title} — ${activeMember.display_label || activeMember.market?.title}`}
          marketId={activeMember.market_id}
          marketType="binary"
        />
      )}

      <BottomNav />
    </div>
  );
};

export default EventDetail;
