import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const countCache = new Map<string, number>();
const pendingFetches = new Map<string, Promise<number | null>>();

const fetchLikeCount = (marketId: string): Promise<number | null> => {
  const existing = pendingFetches.get(marketId);
  if (existing) return existing;

  const promise = supabase
    .from("market_likes")
    .select("*", { count: "exact", head: true })
    .eq("market_id", marketId)
    .then(({ count: c }) => {
      pendingFetches.delete(marketId);
      if (c !== null) {
        countCache.set(marketId, c);
        return c;
      }
      return null;
    });

  pendingFetches.set(marketId, promise);
  return promise;
};

export const useMarketLike = (marketId: string) => {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(countCache.get(marketId) ?? 0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    if (countCache.has(marketId)) {
      setCount(countCache.get(marketId)!);
    }

    const timer = setTimeout(async () => {
      const c = await fetchLikeCount(marketId);
      if (c !== null && isMounted.current) {
        setCount(c);
      }

      // Check if user liked
      if (user?.id && isMounted.current) {
        const { data } = await supabase
          .from("market_likes")
          .select("id")
          .eq("market_id", marketId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (isMounted.current) setLiked(!!data);
      }
    }, Math.random() * 200);

    return () => {
      isMounted.current = false;
      clearTimeout(timer);
    };
  }, [marketId, user?.id]);

  const toggleLike = useCallback(async () => {
    if (!user?.id) return false;
    const prev = liked;
    const prevCount = count;
    setLiked(!prev);
    setCount(prev ? prevCount - 1 : prevCount + 1);

    try {
      if (prev) {
        const { error } = await supabase
          .from("market_likes")
          .delete()
          .eq("market_id", marketId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("market_likes")
          .insert({ market_id: marketId, user_id: user.id });
        if (error) throw error;
      }
      countCache.set(marketId, prev ? prevCount - 1 : prevCount + 1);
      return true;
    } catch {
      setLiked(prev);
      setCount(prevCount);
      return false;
    }
  }, [user?.id, marketId, liked, count]);

  return { liked, likeCount: count, toggleLike };
};
