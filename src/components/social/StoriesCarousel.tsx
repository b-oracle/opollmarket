import { useState } from "react";
import { getAvatarInitials } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { Plus } from "lucide-react";
import StoryCreator from "./StoryCreator";
import StoryViewer from "./StoryViewer";
import LiveAvatarBadge from "./LiveAvatarBadge";
import { useLiveSpaceUsers, useLiveSpaceForUser } from "@/hooks/useLiveSpaceUsers";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import { optimizedImageUrl } from "@/lib/optimizedImage";

interface StoryGroup {
  userId: string;
  profile: { display_name?: string | null; avatar_url?: string | null } | null;
  stories: any[];
  hasUnviewed: boolean;
}

// Sub-component for story bubbles with live badge (needs its own hook call)
const StoryBubble = ({ group, name, isLive, onView, onJoinSpace }: {
  group: StoryGroup; name: string; isLive: boolean;
  onView: () => void;
  onJoinSpace: (space: { id: string; title: string; hostId: string }) => void;
}) => {
  const liveSpace = useLiveSpaceForUser(isLive ? group.userId : undefined);
  return (
    <button
      onClick={() => {
        if (isLive && liveSpace) {
          onJoinSpace({ id: liveSpace.spaceId, title: liveSpace.title, hostId: liveSpace.hostId });
        } else {
          onView();
        }
      }}
      className="flex flex-col items-center gap-1 shrink-0"
    >
      <div className={`relative w-14 h-14 overflow-visible ${
        isLive
          ? "ring-2 ring-destructive rounded-full"
          : group.hasUnviewed
          ? "ring-2 ring-primary rounded-full"
          : "ring-2 ring-muted-foreground/20 rounded-full"
      }`}>
        <LiveAvatarBadge isLive={isLive} size="md" />
        <div className="w-full h-full rounded-full overflow-hidden">
          {group.profile?.avatar_url ? (
            <img src={optimizedImageUrl(group.profile.avatar_url, "avatar-md")} alt={name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{getAvatarInitials(name)}</span>
            </div>
          )}
        </div>
      </div>
      <span className={`text-[9px] font-medium truncate max-w-[56px] ${isLive ? "text-destructive" : "text-muted-foreground"}`}>
        {isLive ? "LIVE" : name.split(" ")[0]}
      </span>
    </button>
  );
};

const StoriesCarousel = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [viewerData, setViewerData] = useState<{ group: StoryGroup; index: number } | null>(null);
  const liveUserIds = useLiveSpaceUsers();
  const { joinSpace } = useActiveSpace();

  // Fetch all active stories filtered by follow connections
  const { data: storyGroups = [] } = useQuery({
    queryKey: ["stories", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get follow connections (people I follow + people who follow me)
      const { data: followRows } = await supabase
        .from("follows")
        .select("follower_id, following_id")
        .or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);

      const connectedIds = new Set<string>([user.id]);
      for (const row of followRows || []) {
        connectedIds.add(row.follower_id);
        connectedIds.add(row.following_id);
      }

      const connectedArray = [...connectedIds];

      const { data: stories } = await supabase
        .from("stories")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .in("user_id", connectedArray.slice(0, 100))
        .order("created_at", { ascending: true })
        .limit(200);

      if (!stories || stories.length === 0) return [];

      // Get profiles
      const userIds = [...new Set(stories.map((s: any) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds.slice(0, 50));
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      // Get user's viewed stories
      const { data: views } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", user.id);
      const viewedIds = new Set((views || []).map((v: any) => v.story_id));

      // Group by user
      const grouped = new Map<string, StoryGroup>();
      for (const story of stories) {
        if (!grouped.has(story.user_id)) {
          grouped.set(story.user_id, {
            userId: story.user_id,
            profile: profileMap.get(story.user_id) || null,
            stories: [],
            hasUnviewed: false,
          });
        }
        const group = grouped.get(story.user_id)!;
        group.stories.push(story);
        if (!viewedIds.has(story.id) && story.user_id !== user.id) {
          group.hasUnviewed = true;
        }
      }

      // Sort: own first, then unviewed, then viewed
      const groups = [...grouped.values()];
      groups.sort((a, b) => {
        if (a.userId === user.id) return -1;
        if (b.userId === user.id) return 1;
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        return 0;
      });

      return groups;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (!user || !isFeatureEnabled("social_stories")) return null;

  const ownGroup = storyGroups.find((g) => g.userId === user?.id);
  const hasOwnStories = ownGroup && ownGroup.stories.length > 0;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1">
        {/* Add Story / View own stories */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center relative cursor-pointer ${
              liveUserIds.has(user?.id || "")
                ? "ring-2 ring-destructive"
                : hasOwnStories ? "ring-2 ring-primary" : "ring-2 ring-dashed ring-muted-foreground/30"
            }`}
            onClick={() => hasOwnStories ? setViewerData({ group: ownGroup!, index: 0 }) : setCreatorOpen(true)}
          >
            <LiveAvatarBadge isLive={liveUserIds.has(user?.id || "")} size="md" />
            <div className="w-full h-full rounded-full overflow-hidden">
              {hasOwnStories && ownGroup?.profile?.avatar_url ? (
                <img src={optimizedImageUrl(ownGroup.profile.avatar_url, "avatar-md")} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </div>
            {hasOwnStories && (
              <button
                onClick={(e) => { e.stopPropagation(); setCreatorOpen(true); }}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center border-2 border-background z-10"
              >
                <Plus className="w-3 h-3 text-primary-foreground" />
              </button>
            )}
          </div>
          <span className="text-[9px] font-medium text-muted-foreground">Your Story</span>
        </div>

        {/* Other users' stories */}
        {storyGroups
          .filter((g) => g.userId !== user?.id)
          .map((group) => {
            const name = group.profile?.display_name || "Anonymous";
            const isLive = liveUserIds.has(group.userId);
            return (
              <StoryBubble
                key={group.userId}
                group={group}
                name={name}
                isLive={isLive}
                onView={() => setViewerData({ group, index: 0 })}
                onJoinSpace={joinSpace}
              />
            );
          })}
      </div>

      <StoryCreator open={creatorOpen} onClose={() => setCreatorOpen(false)} />

      {viewerData && (
        <StoryViewer
          stories={viewerData.group.stories}
          initialIndex={viewerData.index}
          profile={viewerData.group.profile}
          onClose={() => setViewerData(null)}
        />
      )}
    </>
  );
};

export default StoriesCarousel;
