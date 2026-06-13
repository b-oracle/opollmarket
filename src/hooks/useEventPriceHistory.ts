import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export type TimePeriod = "1D" | "1W" | "1M" | "All";

const periodHours: Record<TimePeriod, number | null> = {
  "1D": 24,
  "1W": 168,
  "1M": 720,
  All: null,
};

export interface EventSeriesPoint {
  t: number;
  label: string;
  [marketId: string]: number | string;
}

export interface EventSeriesMeta {
  marketId: string;
  label: string;
  color: string;
  currentYes: number;
}

const DEFAULT_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#9333ea",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#7c3aed",
  "#0d9488", "#be185d", "#84cc16", "#f97316", "#6366f1",
];

interface Member {
  market_id: string;
  display_label: string | null;
  color: string | null;
  sort_order: number;
  market: {
    id: string;
    title: string;
    yes_price: number;
  };
}

export function useEventPriceHistory(
  members: Member[] | undefined,
  timePeriod: TimePeriod
) {
  const marketIds = useMemo(
    () => (members ?? []).map((m) => m.market_id).sort(),
    [members]
  );

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["event-price-history", marketIds.join(",")],
    queryFn: async () => {
      if (marketIds.length === 0) return [];
      const { data } = await supabase
        .from("transactions")
        .select("created_at, side, price, market_id")
        .in("market_id", marketIds)
        .in("type", ["buy", "sell"])
        .eq("status", "confirmed")
        .order("created_at", { ascending: true })
        .limit(5000);
      return data || [];
    },
    enabled: marketIds.length > 0,
    staleTime: 30_000,
  });

  const { series, chartData } = useMemo(() => {
    if (!members || members.length === 0) {
      return { series: [] as EventSeriesMeta[], chartData: [] as EventSeriesPoint[] };
    }
    const hours = periodHours[timePeriod];
    const now = Date.now();
    const windowStart = hours
      ? now - hours * 3600_000
      : transactions.length > 0
      ? new Date(transactions[0].created_at).getTime()
      : now - 30 * 86_400_000;

    const bucketCount = timePeriod === "1D" ? 24 : timePeriod === "1W" ? 28 : 30;
    const bucketMs = (now - windowStart) / bucketCount;

    // Determine starting yes for each market by replaying everything before window
    const lastYes: Record<string, number> = {};
    members.forEach((m, i) => {
      lastYes[m.market_id] = Math.round(Number(m.market.yes_price) * 100);
    });

    const sorted = transactions;
    let idx = 0;
    while (idx < sorted.length && new Date(sorted[idx].created_at).getTime() < windowStart) {
      const t = sorted[idx];
      if (t.market_id && t.price != null) {
        const p = Math.round(Number(t.price) * 100);
        lastYes[t.market_id] = t.side === "yes" ? p : 100 - p;
      }
      idx++;
    }

    const filtered = sorted.slice(idx);
    const buckets: EventSeriesPoint[] = [];
    let txIdx = 0;
    for (let b = 0; b < bucketCount; b++) {
      const bucketEnd = windowStart + (b + 1) * bucketMs;
      while (
        txIdx < filtered.length &&
        new Date(filtered[txIdx].created_at).getTime() <= bucketEnd
      ) {
        const t = filtered[txIdx];
        if (t.market_id && t.price != null) {
          const p = Math.round(Number(t.price) * 100);
          lastYes[t.market_id] = t.side === "yes" ? p : 100 - p;
        }
        txIdx++;
      }
      const point: EventSeriesPoint = {
        t: windowStart + (b + 0.5) * bucketMs,
        label: formatLabel(windowStart + (b + 0.5) * bucketMs, timePeriod),
      };
      members.forEach((m) => {
        point[m.market_id] = lastYes[m.market_id] ?? 50;
      });
      buckets.push(point);
    }

    // Ensure last point matches live current prices
    if (buckets.length > 0) {
      const last = buckets[buckets.length - 1];
      members.forEach((m) => {
        last[m.market_id] = Math.round(Number(m.market.yes_price) * 100);
      });
    }

    const series: EventSeriesMeta[] = members
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m, i) => ({
        marketId: m.market_id,
        label: m.display_label || m.market.title,
        color: m.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        currentYes: Math.round(Number(m.market.yes_price) * 100),
      }));

    return { series, chartData: buckets };
  }, [members, transactions, timePeriod]);

  return { series, chartData, isLoading };
}

function formatLabel(ts: number, period: TimePeriod): string {
  const d = new Date(ts);
  if (period === "1D")
    return d.toLocaleTimeString("en", { hour: "numeric", hour12: true });
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}
