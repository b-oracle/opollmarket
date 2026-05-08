import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  marketId: string;
  /** Current YES price 0..1 — used as the latest data point */
  currentYesPrice: number;
  /** Window in minutes to show. Defaults to 60. */
  windowMinutes?: number;
  className?: string;
  height?: number;
}

interface TxRow {
  created_at: string;
  side: string | null;
  price: number | null;
}

/**
 * Tiny live YES-probability sparkline for binary markets (esp. crypto Up/Down rounds).
 * Renders an SVG line + soft fill, color-coded by direction (green if up over window, red if down).
 */
const OddsSparkline = ({
  marketId,
  currentYesPrice,
  windowMinutes = 60,
  className,
  height = 36,
}: Props) => {
  const qc = useQueryClient();

  // Realtime: invalidate on new transactions
  useEffect(() => {
    const ch = supabase
      .channel(`odds-spark-${marketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions", filter: `market_id=eq.${marketId}` },
        () => qc.invalidateQueries({ queryKey: ["odds-spark", marketId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [marketId, qc]);

  const { data: txs = [] } = useQuery({
    queryKey: ["odds-spark", marketId, windowMinutes],
    queryFn: async (): Promise<TxRow[]> => {
      const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
      const { data } = await supabase
        .from("transactions")
        .select("created_at, side, price")
        .eq("market_id", marketId)
        .in("type", ["buy", "sell"])
        .eq("status", "confirmed")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(300);
      return (data as TxRow[]) || [];
    },
    staleTime: 15_000,
  });

  // Width is responsive via viewBox
  const W = 120;
  const H = height;

  const points = useMemo(() => {
    const now = Date.now();
    const start = now - windowMinutes * 60_000;
    const series: { t: number; y: number }[] = [];

    // Seed with first known yes price (or current)
    let lastYes = currentYesPrice;
    for (const t of txs) {
      if (t.price == null) continue;
      const yes = t.side === "yes" ? t.price : 1 - t.price;
      lastYes = Math.max(0, Math.min(1, yes));
      series.push({ t: new Date(t.created_at).getTime(), y: lastYes });
    }

    // Anchor start + end
    if (series.length === 0 || series[0].t > start) {
      series.unshift({ t: start, y: lastYes });
    }
    series.push({ t: now, y: currentYesPrice });

    return series.map((p) => ({
      x: ((p.t - start) / (now - start)) * W,
      y: H - 2 - p.y * (H - 4),
    }));
  }, [txs, currentYesPrice, windowMinutes, H]);

  const first = points[0]?.y ?? H / 2;
  const last = points[points.length - 1]?.y ?? H / 2;
  const isUp = last <= first; // smaller y = higher price = up
  const stroke = isUp ? "hsl(var(--primary))" : "hsl(var(--destructive))";
  const fill = isUp ? "hsl(var(--primary) / 0.15)" : "hsl(var(--destructive) / 0.15)";

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height: H, display: "block" }}
      aria-hidden
    >
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={1.8} fill={stroke} />
      )}
    </svg>
  );
};

export default OddsSparkline;
