import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, number>();
const pendingFetches = new Map<string, Promise<number | null>>();

const fetchLikeCount = (marketId: string): Promise<number | null> => {
  const existing = pendingFetches.get(marketId);
  if (existing) return existing;

  const request = Promise.resolve(
    supabase
      .from("market_likes")
      .select("id", { count: "exact", head: true })
      .eq("market_id", marketId)
  ).then(({ count, error }) => {
    pendingFetches.delete(marketId);
    if (error) return null;
    const next = count ?? 0;
    cache.set(marketId, next);
    return next;
  });

  pendingFetches.set(marketId, request);
  return request;
};

export const useLikeCount = (marketId: string) => {
  const [count, setCount] = useState(cache.get(marketId) ?? 0);
  const isMounted = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMounted.current = true;

    if (cache.has(marketId)) {
      setCount(cache.get(marketId)!);
    }

    const loadCount = async (attempt = 0) => {
      const next = await fetchLikeCount(marketId);

      if (!isMounted.current) return;

      if (next !== null) {
        setCount(next);
        return;
      }

      if (attempt < 2) {
        retryTimerRef.current = setTimeout(() => {
          void loadCount(attempt + 1);
        }, 350 * (attempt + 1));
      }
    };

    void loadCount();

    return () => {
      isMounted.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [marketId]);

  return count;
};
