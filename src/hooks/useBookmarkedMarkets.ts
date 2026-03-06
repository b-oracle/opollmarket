import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useBookmarkedMarkets = () => {
  const { user } = useAuth();
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBookmarkedIds(new Set());
      setLoading(false);
      return;
    }

    const fetch = async () => {
      const { data } = await supabase
        .from("bookmarks")
        .select("market_id")
        .eq("user_id", user.id);
      setBookmarkedIds(new Set((data ?? []).map((b) => b.market_id)));
      setLoading(false);
    };

    fetch();

    const channel = supabase
      .channel("bookmarks-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookmarks", filter: `user_id=eq.${user.id}` },
        () => { fetch(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return { bookmarkedIds, loading };
};
