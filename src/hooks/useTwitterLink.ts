import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useTwitterLink = (userId?: string) => {
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const { data: twitterProfile, isLoading } = useQuery({
    queryKey: ["twitter-link", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("profiles")
        .select("twitter_username, twitter_id, twitter_avatar_url, twitter_linked_at")
        .eq("id", userId)
        .maybeSingle();
      return data?.twitter_id ? data : null;
    },
    enabled: !!userId,
  });

  const startLink = async (redirectUrl?: string) => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("twitter-auth-start", {
        body: { redirect_url: redirectUrl || window.location.href },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setLinking(false);
      throw err;
    }
  };

  const unlink = async () => {
    setUnlinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("twitter-unlink");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["twitter-link", userId] });
    } finally {
      setUnlinking(false);
    }
  };

  const postTweet = async (text: string) => {
    const { data, error } = await supabase.functions.invoke("twitter-post-tweet", {
      body: { text },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  return {
    twitterProfile,
    isLoading,
    isLinked: !!twitterProfile?.twitter_id,
    linking,
    unlinking,
    startLink,
    unlink,
    postTweet,
  };
};
