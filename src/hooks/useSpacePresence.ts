import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type SpacePresence = {
  participantCount: number;
  joined: boolean;
  configured: boolean;
};

const EMPTY_PRESENCE: SpacePresence = {
  participantCount: 0,
  joined: false,
  configured: false,
};

export const useSpacePresence = (spaceId: string | undefined, enabled = true) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["space-presence", spaceId, user?.id],
    queryFn: async (): Promise<SpacePresence> => {
      if (!spaceId || !user) return EMPTY_PRESENCE;

      await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("space-presence", {
        body: { space_ids: [spaceId] },
      });

      if (error || data?.error) {
        return EMPTY_PRESENCE;
      }

      const presence = data?.spaces?.[spaceId];

      return {
        participantCount: typeof presence?.participant_count === "number" ? presence.participant_count : 0,
        joined: presence?.joined === true,
        configured: data?.configured === true,
      };
    },
    enabled: enabled && !!spaceId && !!user,
    staleTime: 5_000,
    refetchInterval: enabled && !!spaceId && !!user ? 5_000 : false,
    retry: 1,
  });
};