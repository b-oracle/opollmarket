import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useBookmarkCount = (marketId: string | undefined) => {
  const { data: count = 0 } = useQuery({
    queryKey: ["bookmark-count", marketId],
    queryFn: async () => {
      if (!marketId) return 0;
      const { count, error } = await supabase
        .from("bookmarks")
        .select("id", { count: "exact", head: true })
        .eq("market_id", marketId);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!marketId,
    staleTime: 30_000,
  });

  return count;
};
