import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useBookmark = (marketId: string | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !marketId) {
      setLoading(false);
      return;
    }
    supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", user.id)
      .eq("market_id", marketId)
      .maybeSingle()
      .then(({ data }) => {
        setBookmarked(!!data);
        setLoading(false);
      });
  }, [user, marketId]);

  const toggleBookmark = useCallback(async () => {
    if (!user) {
      toast.error("Sign in to add to your watchlist", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    if (!marketId || loading) return;

    const prev = bookmarked;
    setBookmarked(!prev);
    setLoading(true);

    try {
      if (prev) {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", user.id)
          .eq("market_id", marketId);
        if (error) throw error;
        toast.success("Removed from watchlist");
      } else {
        const { error } = await supabase
          .from("bookmarks")
          .insert({ user_id: user.id, market_id: marketId });
        if (error) throw error;
        toast.success("Added to watchlist");
      }
      queryClient.invalidateQueries({ queryKey: ["bookmark-count", marketId] });
      queryClient.invalidateQueries({ queryKey: ["bookmarked-markets"] });
    } catch {
      setBookmarked(prev);
      toast.error("Failed to update watchlist");
    } finally {
      setLoading(false);
    }
  }, [user, marketId, bookmarked, loading]);

  return { bookmarked, loading, toggleBookmark };
};
