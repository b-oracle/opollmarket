import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useEffect } from "react";

type TimePeriod = "1D" | "1W" | "1M" | "All";

interface PricePoint {
  day: number;
  label: string;
  [key: string]: number | string;
}

const periodHours: Record<TimePeriod, number | null> = {
  "1D": 24,
  "1W": 168,
  "1M": 720,
  "All": null,
};

export function usePriceHistory(
  marketId: string | undefined,
  timePeriod: TimePeriod,
  currentYesPrice: number,
  currentNoPrice: number,
  isMulti: boolean,
  options?: { id: string; label: string; price: number }[]
) {
  const queryClient = useQueryClient();

  // Subscribe to realtime transaction inserts for this market
  useEffect(() => {
    if (!marketId) return;
    const channel = supabase
      .channel(`price-history-${marketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `market_id=eq.${marketId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["price-history", marketId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [marketId, queryClient]);
  const { data: transactions = [], isLoading, isFetching, isError } = useQuery({
    queryKey: ["price-history", marketId],
    queryFn: async () => {
      if (!marketId) return [];
      const { data } = await supabase
        .from("transactions")
        .select("created_at, side, price, option_id")
        .eq("market_id", marketId)
        .in("type", ["buy", "sell"])
        .eq("status", "confirmed")
        .order("created_at", { ascending: true })
        .limit(1000);
      return data || [];
    },
    enabled: !!marketId,
    staleTime: 30000,
  });

  const chartData = useMemo((): PricePoint[] => {
    const hours = periodHours[timePeriod];
    const now = Date.now();
    const cutoff = hours ? now - hours * 3600000 : 0;

    // Filter transactions within time window
    const filtered = transactions.filter(
      (t) => new Date(t.created_at).getTime() >= cutoff
    );

    // Determine number of buckets
    const bucketCount = timePeriod === "1D" ? 24 : timePeriod === "1W" ? 28 : timePeriod === "1M" ? 30 : 30;
    const windowMs = hours ? hours * 3600000 : (now - (transactions.length > 0 ? new Date(transactions[0].created_at).getTime() : now - 30 * 86400000));
    const bucketMs = windowMs / bucketCount;
    const windowStart = hours ? now - hours * 3600000 : (transactions.length > 0 ? new Date(transactions[0].created_at).getTime() : now - 30 * 86400000);

    if (isMulti && options && options.length > 0) {
      // Multi-option market
      // Track last known price per option
      const lastPrices: Record<string, number> = {};
      options.forEach((opt) => {
        lastPrices[opt.id] = opt.price * 100; // will be overwritten by historical data
      });

      // Build buckets
      const buckets: PricePoint[] = [];
      let txIdx = 0;

      for (let b = 0; b < bucketCount; b++) {
        const bucketEnd = windowStart + (b + 1) * bucketMs;
        
        // Process all transactions up to this bucket
        while (txIdx < filtered.length && new Date(filtered[txIdx].created_at).getTime() <= bucketEnd) {
          const t = filtered[txIdx];
          if (t.option_id && t.price != null) {
            lastPrices[t.option_id] = Math.round(t.price * 100);
          }
          txIdx++;
        }

        const point: PricePoint = {
          day: b + 1,
          label: formatBucketLabel(windowStart + (b + 0.5) * bucketMs, timePeriod),
        };
        options.forEach((opt) => {
          point[opt.label] = lastPrices[opt.id] ?? Math.round(opt.price * 100);
        });
        buckets.push(point);
      }

      // Ensure last point matches current prices
      if (buckets.length > 0) {
        const last = buckets[buckets.length - 1];
        options.forEach((opt) => {
          last[opt.label] = Math.round(opt.price * 100);
        });
      }

      return buckets;
    }

    // Binary market
    // Track running yes price
    let lastYes = currentYesPrice; // will be overwritten
    
    // Find the earliest price in the window for the starting point
    // Walk through transactions before the window to get the starting price
    const allBefore = transactions.filter(
      (t) => new Date(t.created_at).getTime() < windowStart
    );
    if (allBefore.length > 0) {
      const lastBefore = allBefore[allBefore.length - 1];
      if (lastBefore.price != null) {
        if (lastBefore.side === "yes") lastYes = Math.round(lastBefore.price * 100);
        else lastYes = 100 - Math.round(lastBefore.price * 100);
      }
    } else if (filtered.length === 0) {
      // No history at all, use current price
      lastYes = currentYesPrice;
    }

    const buckets: PricePoint[] = [];
    let txIdx = 0;

    for (let b = 0; b < bucketCount; b++) {
      const bucketEnd = windowStart + (b + 1) * bucketMs;
      
      while (txIdx < filtered.length && new Date(filtered[txIdx].created_at).getTime() <= bucketEnd) {
        const t = filtered[txIdx];
        if (t.price != null) {
          if (t.side === "yes") lastYes = Math.round(t.price * 100);
          else lastYes = 100 - Math.round(t.price * 100);
        }
        txIdx++;
      }

      buckets.push({
        day: b + 1,
        label: formatBucketLabel(windowStart + (b + 0.5) * bucketMs, timePeriod),
        yes: lastYes,
        no: 100 - lastYes,
      });
    }

    // Ensure last point matches current
    if (buckets.length > 0) {
      const last = buckets[buckets.length - 1];
      last.yes = currentYesPrice;
      last.no = currentNoPrice;
    }

    return buckets;
  }, [transactions, timePeriod, currentYesPrice, currentNoPrice, isMulti, options]);

  return chartData;
}

function formatBucketLabel(timestamp: number, period: TimePeriod): string {
  const d = new Date(timestamp);
  if (period === "1D") {
    return d.toLocaleTimeString("en", { hour: "numeric", hour12: true });
  }
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}
