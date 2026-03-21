import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a Set of user IDs that are currently live in an active space.
 * Refreshes every 15 seconds.
 */
export const useLiveSpaceUsers = () => {
  const { data: liveUserIds = new Set<string>() } = useQuery({
    queryKey: ["live-space-users"],
    queryFn: async () => {
      // Get all participants in live spaces who haven't left
      const { data: liveSpaces } = await supabase
        .from("spaces")
        .select("id")
        .eq("status", "live")
        .limit(50);

      if (!liveSpaces || liveSpaces.length === 0) return new Set<string>();

      const spaceIds = liveSpaces.map((s) => s.id);
      const { data: participants } = await supabase
        .from("space_participants")
        .select("user_id, space_id")
        .in("space_id", spaceIds)
        .is("left_at", null);

      if (!participants) return new Set<string>();

      // Build a map of userId -> spaceId for join navigation
      const ids = new Set<string>();
      participants.forEach((p) => ids.add(p.user_id));
      return ids;
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  return liveUserIds;
};

/**
 * Returns the space ID a given user is currently live in, or null.
 */
export const useLiveSpaceForUser = (userId: string | undefined) => {
  const { data: spaceId = null } = useQuery({
    queryKey: ["live-space-for-user", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("space_participants")
        .select("space_id, spaces!inner(id, title, host_id, status)")
        .eq("user_id", userId)
        .is("left_at", null)
        .limit(1)
        .maybeSingle();

      if (!data) return null;
      const space = (data as any).spaces;
      if (!space || space.status !== "live") return null;
      return { spaceId: space.id, title: space.title, hostId: space.host_id };
    },
    enabled: !!userId,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  return spaceId;
};
