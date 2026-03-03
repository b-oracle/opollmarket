import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const useBookmark = (marketId: string | undefined) => {
  const { user } = useAuth();
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
      toast.error("Sign in to bookmark markets");
      return;
    }
    if (!marketId) return;

    const prev = bookmarked;
    setBookmarked(!prev);

    try {
      if (prev) {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", user.id)
          .eq("market_id", marketId);
        if (error) throw error;
        toast.success("Removed from bookmarks");
      } else {
        const { error } = await supabase
          .from("bookmarks")
          .insert({ user_id: user.id, market_id: marketId });
        if (error) throw error;
        toast.success("Added to bookmarks");
      }
    } catch {
      setBookmarked(prev);
      toast.error("Failed to update bookmark");
    }
  }, [user, marketId, bookmarked]);

  return { bookmarked, loading, toggleBookmark };
};
