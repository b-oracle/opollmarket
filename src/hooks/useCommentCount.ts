import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, number>();

export const useCommentCount = (marketId: string) => {
  const [count, setCount] = useState(cache.get(marketId) ?? 0);

  useEffect(() => {
    const fetch = async () => {
      const { count: c, error } = await supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("market_id", marketId);

      if (!error && c !== null) {
        cache.set(marketId, c);
        setCount(c);
      }
    };
    fetch();

    const channel = supabase
      .channel(`comment-count-${marketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `market_id=eq.${marketId}` }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [marketId]);

  return count;
};
