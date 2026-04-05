import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CategoryIcon from "@/components/CategoryIcon";
import { Users, ChevronRight } from "lucide-react";
import CommunityChat from "./CommunityChat";

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

  if (!onOpenChat && activeCommunity) {
    return (
      <CommunityChat
        slug={activeCommunity.slug}
        label={activeCommunity.label}
        onBack={() => setActiveCommunity(null)}
      />
    );
  }

  const membershipSet = new Set(memberships);

  return (
    <div className="divide-y divide-border">
      {COMMUNITIES.map((c) => (
        <button
          key={c.slug}
          onClick={() => setActiveCommunity(c)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/30 transition-colors text-left"
        >
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CategoryIcon category={categoryMap[c.slug] || "Other"} className="w-5 h-5 text-primary" />
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
      ))}
    </div>
  );
};

export default CommunitiesTab;
