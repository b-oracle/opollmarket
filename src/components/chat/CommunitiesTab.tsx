import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CategoryIcon from "@/components/CategoryIcon";
import { Users, ChevronRight } from "lucide-react";
import CommunityChat from "./CommunityChat";
import { fetchCommunityReads } from "@/lib/communityReads";

const COMMUNITIES = [
  { slug: "crypto", label: "Crypto" },
  { slug: "sports", label: "Sports" },
  { slug: "politics", label: "Politics" },
  { slug: "entertainment", label: "Entertainment" },
  { slug: "economy", label: "Economy" },
  { slug: "ai-tech", label: "AI & Tech" },
  { slug: "science", label: "Science" },
  { slug: "forex", label: "Forex" },
  { slug: "commodities", label: "Commodities" },
  { slug: "twitter-x", label: "Twitter/X" },
];

const categoryMap: Record<string, string> = {
  crypto: "Crypto",
  sports: "Sports",
  politics: "Politics",
  entertainment: "Entertainment",
  economy: "Economy",
  "ai-tech": "AI & Tech",
  science: "Science",
  forex: "Forex",
  commodities: "Commodities",
  "twitter-x": "Twitter/X",
};

const CommunitiesTab = ({ onOpenChat }: { onOpenChat?: (slug: string, label: string) => void }) => {
  const { user } = useAuth();
  const [activeCommunity, setActiveCommunity] = useState<{ slug: string; label: string } | null>(null);

  const { data: memberships = [] } = useQuery({
    queryKey: ["community-memberships", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("community_memberships" as any)
        .select("community_slug")
        .eq("user_id", user.id);
      return (data || []).map((d: any) => d.community_slug);
    },
    enabled: !!user,
  });

  const { data: memberCounts = {} } = useQuery({
    queryKey: ["community-member-counts"],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      for (const c of COMMUNITIES) {
        const { count } = await supabase
          .from("community_memberships" as any)
          .select("id", { count: "exact", head: true })
          .eq("community_slug", c.slug) as any;
        counts[c.slug] = count || 0;
      }
      return counts;
    },
    staleTime: 30_000,
  });

  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["community-unread-per-slug", user?.id],
    queryFn: async () => {
      if (!user) return {};
      const counts: Record<string, number> = {};
      for (const c of COMMUNITIES) {
        const lastRead = localStorage.getItem(`community_last_read_${user.id}_${c.slug}`);
        const since = lastRead || "2000-01-01T00:00:00Z";
        const { count } = await supabase
          .from("community_messages" as any)
          .select("id", { count: "exact", head: true })
          .eq("community_slug", c.slug)
          .neq("user_id", user.id)
          .gt("created_at", since) as any;
        if (count && count > 0) counts[c.slug] = count;
      }
      return counts;
    },
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!onOpenChat && activeCommunity) {
    return (
      <div className="h-[calc(100dvh-120px)]">
        <CommunityChat
          slug={activeCommunity.slug}
          label={activeCommunity.label}
          onBack={() => setActiveCommunity(null)}
        />
      </div>
    );
  }

  const membershipSet = new Set(memberships);

  return (
    <div className="divide-y divide-border">
      {COMMUNITIES.map((c) => {
        const unread = unreadCounts[c.slug] || 0;
        return (
          <button
            key={c.slug}
            onClick={() => onOpenChat ? onOpenChat(c.slug, c.label) : setActiveCommunity(c)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="relative w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <CategoryIcon category={categoryMap[c.slug] || "Other"} className="w-5 h-5 text-primary" />
              {unread > 0 && membershipSet.has(c.slug) && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{c.label}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{memberCounts[c.slug] || 0} members</span>
                {membershipSet.has(c.slug) && (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    Joined
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );
};

export default CommunitiesTab;
