import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { fetchCommunityReads, markCommunityReadRemote } from "@/lib/communityReads";

/**
 * Returns unread counts for support tickets and community messages.
 * Uses localStorage timestamps to track when user last viewed each section.
 */
export const useUnreadCounts = () => {
  const { user } = useAuth();

  const { data: supportData = { total: 0, perTicket: {} as Record<string, number> } } = useQuery({
    queryKey: ["unread-support", user?.id],
    queryFn: async () => {
      if (!user) return { total: 0, perTicket: {} as Record<string, number> };
      const globalLastRead = localStorage.getItem(`support_last_read_${user.id}`);
      const globalSince = globalLastRead || "2000-01-01T00:00:00Z";

      const { data: myTickets } = await supabase
        .from("support_tickets" as any)
        .select("id")
        .eq("user_id", user.id) as any;

      if (!myTickets || myTickets.length === 0) return { total: 0, perTicket: {} as Record<string, number> };

      const ticketIds = myTickets.map((t: any) => t.id);

      // Get all unread messages with ticket_id for per-ticket counts
      const { data: msgs } = await supabase
        .from("support_messages" as any)
        .select("id, ticket_id, created_at")
        .in("ticket_id", ticketIds)
        .neq("user_id", user.id)
        .gt("created_at", globalSince) as any;

      const perTicket: Record<string, number> = {};
      let total = 0;

      for (const msg of (msgs || [])) {
        const ticketLastRead = localStorage.getItem(`support_ticket_read_${user.id}_${msg.ticket_id}`);
        const since = ticketLastRead || globalSince;
        if (msg.created_at > since) {
          perTicket[msg.ticket_id] = (perTicket[msg.ticket_id] || 0) + 1;
          total++;
        }
      }

      return { total, perTicket };
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const supportUnread = supportData.total;
  const supportPerTicket = supportData.perTicket;

  const { data: communityUnread = 0 } = useQuery({
    queryKey: ["unread-community", user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { data: memberships } = await supabase
        .from("community_memberships" as any)
        .select("community_slug")
        .eq("user_id", user.id) as any;

      if (!memberships || memberships.length === 0) return 0;

      const reads = await fetchCommunityReads(user.id);

      let total = 0;
      for (const m of memberships) {
        const since = reads[m.community_slug] || "2000-01-01T00:00:00Z";

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

  const markTicketRead = (ticketId: string) => {
    if (user) {
      localStorage.setItem(`support_ticket_read_${user.id}_${ticketId}`, new Date().toISOString());
    }
  };

  const markCommunityRead = (slug: string) => {
    if (user) {
      localStorage.setItem(`community_last_read_${user.id}_${slug}`, new Date().toISOString());
    }
  };

  return { supportUnread, supportPerTicket, communityUnread, markSupportRead, markTicketRead, markCommunityRead };
};
