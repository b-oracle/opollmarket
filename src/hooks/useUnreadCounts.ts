import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Returns unread counts for support tickets and community messages.
 * Uses localStorage timestamps to track when user last viewed each section.
 */
export const useUnreadCounts = () => {
  const { user } = useAuth();

  const { data: supportUnread = 0 } = useQuery({
    queryKey: ["unread-support", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const lastRead = localStorage.getItem(`support_last_read_${user.id}`);
      const since = lastRead || "2000-01-01T00:00:00Z";

      // Count support messages sent to the user (staff replies on their tickets) since last read
      const { data: myTickets } = await supabase
        .from("support_tickets" as any)
        .select("id")
        .eq("user_id", user.id) as any;

      if (!myTickets || myTickets.length === 0) return 0;

      const ticketIds = myTickets.map((t: any) => t.id);
      const { count } = await supabase
        .from("support_messages" as any)
        .select("id", { count: "exact", head: true })
        .in("ticket_id", ticketIds)
        .neq("user_id", user.id)
        .gt("created_at", since) as any;

      return count || 0;
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: communityUnread = 0 } = useQuery({
    queryKey: ["unread-community", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      // Get communities the user has joined
      const { data: memberships } = await supabase
        .from("community_memberships" as any)
        .select("community_slug")
        .eq("user_id", user.id) as any;

      if (!memberships || memberships.length === 0) return 0;

      let total = 0;
      for (const m of memberships) {
        const lastRead = localStorage.getItem(`community_last_read_${user.id}_${m.community_slug}`);
        const since = lastRead || "2000-01-01T00:00:00Z";

        const { count } = await supabase
          .from("community_messages" as any)
          .select("id", { count: "exact", head: true })
          .eq("community_slug", m.community_slug)
          .neq("user_id", user.id)
          .gt("created_at", since) as any;

        total += count || 0;
      }
      return total;
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const markSupportRead = () => {
    if (user) {
      localStorage.setItem(`support_last_read_${user.id}`, new Date().toISOString());
    }
  };

  const markCommunityRead = (slug: string) => {
    if (user) {
      localStorage.setItem(`community_last_read_${user.id}_${slug}`, new Date().toISOString());
    }
  };

  return { supportUnread, communityUnread, markSupportRead, markCommunityRead };
};
