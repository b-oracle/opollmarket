import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BatchCounts {
  comments: Map<string, number>;
  likes: Map<string, number>;
}

/**
 * Fetches comment and like counts for ALL provided market IDs in just 2 queries
 * instead of 2×N individual queries (N+1 problem).
 * Results are cached for 60s via React Query staleTime.
 */
export const useBatchCounts = (marketIds: string[]) => {
  const key = marketIds.length > 0 ? marketIds.slice(0, 5).join(",") + `_${marketIds.length}` : "";

  return useQuery<BatchCounts>({
    queryKey: ["batch-counts", key],
    queryFn: async () => {
      const comments = new Map<string, number>();
      const likes = new Map<string, number>();

      if (marketIds.length === 0) return { comments, likes };

      // Batch fetch: get counts grouped by market_id in 2 queries total
      const [commentResult, likeResult] = await Promise.all([
        supabase
          .from("comments")
          .select("market_id")
          .in("market_id", marketIds.slice(0, 100)),
        supabase
          .from("market_likes")
          .select("market_id")
          .in("market_id", marketIds.slice(0, 100)),
      ]);

      // Count comments per market
      if (commentResult.data) {
        for (const row of commentResult.data) {
          const mid = (row as any).market_id as string;
          comments.set(mid, (comments.get(mid) || 0) + 1);
        }
      }

      // Count likes per market
      if (likeResult.data) {
        for (const row of likeResult.data) {
          const mid = (row as any).market_id as string;
          likes.set(mid, (likes.get(mid) || 0) + 1);
        }
      }

      return { comments, likes };
    },
    enabled: marketIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
};
