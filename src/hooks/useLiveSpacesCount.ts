import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useQueryClient } from "@tanstack/react-query";

export const useLiveSpacesCount = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime: refresh when spaces change status
  useEffect(() => {
    const channel = supabase
      .channel("live-spaces-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "spaces" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["live-spaces-count"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["live-spaces-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase.rpc("count_visible_live_spaces" as any, {
        _user_id: user.id,
      });
      if (error) return 0;
      return (data as number) || 0;
    },
    enabled: !!user,
    refetchInterval: 15000,
  });
};
