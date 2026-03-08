import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const useFollow = (targetUserId: string | undefined) => {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || !targetUserId || user.id === targetUserId) return;
    (async () => {
      const { data } = await supabase
        .from("follows" as any)
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();
      setIsFollowing(!!data);
    })();
  }, [user, targetUserId]);

  const toggleFollow = useCallback(async () => {
    if (!user || !targetUserId || loading || user.id === targetUserId) return;
    setLoading(true);
    const prev = isFollowing;
    setIsFollowing(!prev);

    try {
      if (prev) {
        await supabase
          .from("follows" as any)
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        toast.success("Unfollowed");
      } else {
        await supabase
          .from("follows" as any)
          .insert({ follower_id: user.id, following_id: targetUserId });
        toast.success("Following!");
      }
      queryClient.invalidateQueries({ queryKey: ["follow-counts", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["user-profile", targetUserId] });
    } catch {
      setIsFollowing(prev);
      toast.error("Failed to update follow");
    } finally {
      setLoading(false);
    }
  }, [user, targetUserId, isFollowing, loading, queryClient]);

  return { isFollowing, loading, toggleFollow };
};

export const useFollowCounts = (userId: string | undefined) => {
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.rpc("get_follow_counts" as any, { _user_id: userId });
      if (data && Array.isArray(data) && data[0]) {
        setCounts({
          followers: Number(data[0].followers_count) || 0,
          following: Number(data[0].following_count) || 0,
        });
      }
    })();
  }, [userId]);

  return counts;
};
