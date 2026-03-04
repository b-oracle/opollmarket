import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const countCache = new Map<string, number>();

export const useMarketLike = (marketId: string) => {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(countCache.get(marketId) ?? 0);

  useEffect(() => {
    const fetchData = async () => {
      // Get count
      const { count: c } = await supabase
        .from("market_likes")
        .select("*", { count: "exact", head: true })
        .eq("market_id", marketId);

      if (c !== null) {
        countCache.set(marketId, c);
        setCount(c);
      }

      // Check if user liked
      if (user?.id) {
        const { data } = await supabase
          .from("market_likes")
          .select("id")
          .eq("market_id", marketId)
          .eq("user_id", user.id)
          .maybeSingle();
        setLiked(!!data);
      }
    };
    fetchData();
  }, [marketId, user?.id]);

  const toggleLike = useCallback(async () => {
    if (!user?.id) return false; // not signed in
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
