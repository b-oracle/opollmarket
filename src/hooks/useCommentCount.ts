import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, number>();
const pendingFetches = new Map<string, Promise<number | null>>();

const fetchCount = (marketId: string): Promise<number | null> => {
  const existing = pendingFetches.get(marketId);
  if (existing) return existing;

  const promise = supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("market_id", marketId)
    .then(({ count: c, error }) => {
      pendingFetches.delete(marketId);
      if (!error && c !== null) {
        cache.set(marketId, c);
        return c;
      }
      return null;
    });

  pendingFetches.set(marketId, promise);
  return promise;
};

export const useCommentCount = (marketId: string) => {
  const [count, setCount] = useState(cache.get(marketId) ?? 0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    // Use cached value if available, skip network request
    if (cache.has(marketId)) {
      setCount(cache.get(marketId)!);
    }

    // Debounce the fetch slightly to avoid flooding
    const timer = setTimeout(async () => {
      const c = await fetchCount(marketId);
      if (c !== null && isMounted.current) {
        setCount(c);
      }
    }, Math.random() * 200); // Stagger requests

    return () => {
      isMounted.current = false;
      clearTimeout(timer);
    };
  }, [marketId]);

  return count;
};
