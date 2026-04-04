import { useEffect } from "react";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const getLiveSpaceUsersQueryKey = (viewerId?: string) => ["live-space-users", viewerId ?? "guest"];
const LIVE_SPACE_USERS_CHANNEL = "live-space-users-sync";

const liveSpaceQueryInvalidators = new Set<() => void>();
let liveSpaceUsersChannel: ReturnType<typeof supabase.channel> | null = null;
let liveSpaceUsersChannelRefs = 0;

const invalidateLiveSpaceQueries = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: ["live-space-users"] });
  void queryClient.invalidateQueries({ queryKey: ["live-space-for-user"] });
};

const ensureLiveSpaceUsersSubscription = (queryClient: QueryClient) => {
  const invalidate = () => invalidateLiveSpaceQueries(queryClient);

  liveSpaceQueryInvalidators.add(invalidate);
  liveSpaceUsersChannelRefs += 1;

  if (!liveSpaceUsersChannel) {
    const broadcastInvalidation = () => {
      for (const listener of liveSpaceQueryInvalidators) listener();
    };

    liveSpaceUsersChannel = supabase
      .channel(LIVE_SPACE_USERS_CHANNEL)
      .on("postgres_changes", { event: "*", schema: "public", table: "spaces" }, broadcastInvalidation)
      .on("postgres_changes", { event: "*", schema: "public", table: "space_participants" }, broadcastInvalidation)
      .subscribe();
  }

  return () => {
    liveSpaceQueryInvalidators.delete(invalidate);
    liveSpaceUsersChannelRefs = Math.max(0, liveSpaceUsersChannelRefs - 1);

    if (liveSpaceUsersChannelRefs === 0 && liveSpaceUsersChannel) {
      void supabase.removeChannel(liveSpaceUsersChannel);
      liveSpaceUsersChannel = null;
    }
  };
};

/**
 * Returns a Set of user IDs that are currently live in an active space.
 * Refreshes every 15 seconds.
 */
export const useLiveSpaceUsers = () => {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (loading || !user) return;

    return ensureLiveSpaceUsersSubscription(queryClient);
  }, [loading, queryClient, user?.id]);

  const { data: liveUserIds = new Set<string>() } = useQuery({
    queryKey: getLiveSpaceUsersQueryKey(user?.id),
    queryFn: async () => {
      if (!user) return new Set<string>();

      await supabase.auth.getSession();

      const [{ data: activeParticipantIds }, { data: visibleSpaces }] = await Promise.all([
        supabase.rpc("get_live_space_user_ids" as any),
        supabase.rpc("get_visible_spaces" as any, {
          _user_id: user.id,
        }),
      ]);

      const liveIds = new Set<string>();

      if (Array.isArray(activeParticipantIds)) {
        for (const id of activeParticipantIds) {
          if (typeof id === "string") liveIds.add(id);
        }
      }

      if (Array.isArray(visibleSpaces)) {
        for (const space of visibleSpaces as any[]) {
          if (space?.status === "live" && typeof space?.host_id === "string") {
            liveIds.add(space.host_id);
          }
        }
      }

      return liveIds;
    },
    enabled: !loading && !!user,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  return liveUserIds;
};

/**
 * Returns the space ID a given user is currently live in, or null.
 */
export const useLiveSpaceForUser = (userId: string | undefined) => {
  const { user, loading } = useAuth();

  const { data: spaceId = null } = useQuery({
    queryKey: ["live-space-for-user", user?.id ?? "guest", userId],
    queryFn: async () => {
      if (!userId || !user) return null;

      await supabase.auth.getSession();

      const { data } = await supabase
        .from("space_participants")
        .select("space_id, spaces!inner(id, title, host_id, status)")
        .eq("user_id", userId)
        .is("left_at", null)
        .limit(1)
        .maybeSingle();

      if (!data) return null;
      const space = (data as any).spaces;
      if (space && space.status === "live") {
        return { spaceId: space.id, title: space.title, hostId: space.host_id };
      }

      const { data: visibleSpaces } = await supabase.rpc("get_visible_spaces" as any, {
        _user_id: user.id,
      });

      const liveHostSpace = (visibleSpaces as any[] | null)?.find(
        (visibleSpace) => visibleSpace?.status === "live" && visibleSpace?.host_id === userId,
      );

      if (!liveHostSpace) return null;

      return {
        spaceId: liveHostSpace.id,
        title: liveHostSpace.title,
        hostId: liveHostSpace.host_id,
      };
    },
    enabled: !loading && !!user && !!userId,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  return spaceId;
};
