import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, number>();

// Batch queue: collect market IDs and resolve them in one round-trip
let batchQueue: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const batchListeners = new Map<string, Set<(count: number) => void>>();

const flushBatch = async () => {
  const ids = [...new Set(batchQueue)];
  batchQueue = [];
  if (ids.length === 0) return;

  // Fetch all counts in parallel chunks of 50
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from("market_likes")
        .select("market_id")
        .in("market_id", chunk);

      if (error) return;

      // Count occurrences per market_id
      const counts = new Map<string, number>();
      chunk.forEach((id) => counts.set(id, 0));
      (data || []).forEach((row: { market_id: string }) => {
        counts.set(row.market_id, (counts.get(row.market_id) || 0) + 1);
      });

      counts.forEach((count, marketId) => {
        cache.set(marketId, count);
        batchListeners.get(marketId)?.forEach((cb) => cb(count));
      });
    })
  );
};

const enqueue = (marketId: string, callback: (count: number) => void) => {
  if (!batchListeners.has(marketId)) {
    batchListeners.set(marketId, new Set());
  }
  batchListeners.get(marketId)!.add(callback);

  batchQueue.push(marketId);
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(flushBatch, 50);
};

export const useLikeCount = (marketId: string) => {
  const [count, setCount] = useState(cache.get(marketId) ?? 0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    if (cache.has(marketId)) {
      setCount(cache.get(marketId)!);
    }

    const cb = (c: number) => {
      if (isMounted.current) setCount(c);
    };
    enqueue(marketId, cb);

    return () => {
      isMounted.current = false;
      batchListeners.get(marketId)?.delete(cb);
    };
  }, [marketId]);

  return count;
};
