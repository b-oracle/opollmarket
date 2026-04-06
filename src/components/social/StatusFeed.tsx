import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import StatusCard from "./StatusCard";
import StatusComposer from "./StatusComposer";
import SocialAdCard from "./SocialAdCard";
import { Loader2, FileText } from "lucide-react";
import { useMemo } from "react";

interface StatusFeedProps {
  userId?: string;
  showComposer?: boolean;
  onlyUserId?: string;
}

interface FeedItem {
  type: "original" | "repost" | "ad";
  status: any;
  sortTime: string;
  reposterId?: string;
  ad?: any;
}

const StatusFeed = ({ userId, showComposer = false, onlyUserId }: StatusFeedProps) => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();

  // Fetch the social circle (followers + following) for the profile user
  const { data: socialCircleIds = [] } = useQuery({
    queryKey: ["social-circle", userId],
    queryFn: async () => {
      if (!userId) return [];
      const [{ data: followers }, { data: following }] = await Promise.all([
        supabase.from("follows").select("follower_id").eq("following_id", userId),
        supabase.from("follows").select("following_id").eq("follower_id", userId),
      ]);
      const ids = new Set<string>();
      ids.add(userId);
      (followers || []).forEach((f: any) => ids.add(f.follower_id));
      (following || []).forEach((f: any) => ids.add(f.following_id));
      return [...ids];
    },
    enabled: !!userId,
  });

  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ["status-feed", userId || "global", user?.id, socialCircleIds.length, onlyUserId || "all"],
    queryFn: async () => {
      // "My Posts" filter — show only the specified user's posts
      if (onlyUserId) {
        const { data } = await supabase
          .from("status_updates")
          .select("*")
          .eq("user_id", onlyUserId)
          .order("created_at", { ascending: false })
          .limit(50);
        return data || [];
      }
      if (userId && socialCircleIds.length > 0) {
        const { data } = await supabase
          .from("status_updates")
          .select("*")
          .in("user_id", socialCircleIds.slice(0, 50))
          .order("created_at", { ascending: false })
          .limit(50);
        return data || [];
      }
      if (userId) {
        const { data } = await supabase
          .from("status_updates")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        return data || [];
      }
      const { data } = await supabase
        .from("status_updates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!onlyUserId || !userId || socialCircleIds.length > 0,
  });

  // Fetch reposts from social circle
  const { data: reposts = [] } = useQuery({
    queryKey: ["status-feed-reposts", userId || "global", socialCircleIds.length],
    queryFn: async () => {
      const targetIds = userId && socialCircleIds.length > 0 ? socialCircleIds : null;
      let query = supabase
        .from("status_reposts")
        .select("status_id, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (targetIds) {
        query = query.in("user_id", targetIds.slice(0, 50));
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !userId || socialCircleIds.length > 0,
  });

  // Fetch active social ads
  const { data: socialAds = [] } = useQuery({
    queryKey: ["social-ads-feed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("social_ads")
        .select("id, market_id, headline, video_url, impressions, clicks")
        .eq("status", "active")
        .gte("ends_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    staleTime: 60_000,
  });

  // Fetch the actual statuses for reposts that aren't already in the feed
  const repostStatusIds = reposts
    .map((r: any) => r.status_id)
    .filter((id: string) => !statuses.some((s: any) => s.id === id));

  const { data: repostedStatuses = [] } = useQuery({
    queryKey: ["reposted-statuses", repostStatusIds.join(",")],
    queryFn: async () => {
      if (repostStatusIds.length === 0) return [];
      const { data } = await supabase
        .from("status_updates")
        .select("*")
        .in("id", repostStatusIds.slice(0, 50));
      return data || [];
    },
    enabled: repostStatusIds.length > 0,
  });

  // Merge into a unified feed
  const allStatuses = useMemo(() => {
    const statusMap = new Map<string, any>();
    [...statuses, ...repostedStatuses].forEach((s: any) => statusMap.set(s.id, s));
    return statusMap;
  }, [statuses, repostedStatuses]);

  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    const seen = new Set<string>();

    // Add original statuses
    statuses.forEach((s: any) => {
      items.push({ type: "original", status: s, sortTime: s.created_at });
      seen.add(s.id);
    });

    // Add reposts (may duplicate the original, that's intentional - shows as "X repolled")
    reposts.forEach((r: any) => {
      const status = allStatuses.get(r.status_id);
      if (!status) return;
      // Don't show repost if user reposted their own post
      if (r.user_id === status.user_id) return;
      const key = `repost-${r.user_id}-${r.status_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ type: "repost", status, sortTime: r.created_at, reposterId: r.user_id });
    });

    items.sort((a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime());
    
    // Inject social ads every 5 posts
    const withAds = [...items.slice(0, 80)];
    if (socialAds.length > 0) {
      socialAds.forEach((ad: any, adIdx: number) => {
        const insertAt = (adIdx + 1) * 5;
        if (insertAt <= withAds.length) {
          withAds.splice(insertAt, 0, {
            type: "ad" as const,
            status: null,
            sortTime: "",
            ad,
          });
        }
      });
    }

    return withAds;
  }, [statuses, reposts, allStatuses, socialAds]);

  // Fetch profiles for all authors + reposters
  const allUserIds = useMemo(() => {
    const ids = new Set<string>();
    feedItems.forEach((item) => {
      if (item.status) ids.add(item.status.user_id);
      if (item.reposterId) ids.add(item.reposterId);
    });
    return [...ids];
  }, [feedItems]);

  const { data: profileMap = new Map() } = useQuery({
    queryKey: ["status-profiles", allUserIds.join(",")],
    queryFn: async () => {
      if (allUserIds.length === 0) return new Map();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", allUserIds.slice(0, 50));
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    enabled: allUserIds.length > 0,
  });

  // Fetch market data for statuses that have a market_id + social ads
  const marketIds = useMemo(() => {
    const ids = new Set<string>();
    feedItems.forEach((i) => {
      if (i.status?.market_id) ids.add(i.status.market_id);
      if (i.ad?.market_id) ids.add(i.ad.market_id);
    });
    return [...ids];
  }, [feedItems]);

  const { data: marketMap = new Map() } = useQuery({
    queryKey: ["status-markets", marketIds.join(",")],
    queryFn: async () => {
      if (marketIds.length === 0) return new Map();
      const { data } = await supabase
        .from("markets")
        .select("id, title, image_url, yes_price, no_price, status")
        .in("id", marketIds.slice(0, 50));
      return new Map((data || []).map((m: any) => [m.id, m]));
    },
    enabled: marketIds.length > 0,
  });

  if (!isFeatureEnabled("social_status_feed")) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showComposer && <StatusComposer />}

      {feedItems.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <FileText className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No posts yet</p>
        </div>
      ) : (
        feedItems.map((item, i) => {
          if (item.type === "ad" && item.ad) {
            return (
              <SocialAdCard
                key={`ad-${item.ad.id}`}
                ad={item.ad}
                market={(marketMap as Map<string, any>).get(item.ad.market_id)}
                index={i}
              />
            );
          }

          const reposterProfile = item.reposterId
            ? (profileMap as Map<string, any>).get(item.reposterId)
            : null;
          return (
            <StatusCard
              key={item.type === "repost" ? `repost-${item.reposterId}-${item.status.id}` : item.status.id}
              status={item.status}
              profile={(profileMap as Map<string, any>).get(item.status.user_id)}
              market={item.status.market_id ? (marketMap as Map<string, any>).get(item.status.market_id) : undefined}
              index={i}
              repostedBy={
                item.type === "repost" && item.reposterId
                  ? { name: reposterProfile?.display_name || "Someone", userId: item.reposterId }
                  : null
              }
            />
          );
        })
      )}
    </div>
  );
};

export default StatusFeed;
