import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import FollowButton from "@/components/FollowButton";
import ActivityFeed from "@/components/ActivityFeed";
import StatusFeed from "@/components/social/StatusFeed";
import StoriesCarousel from "@/components/social/StoriesCarousel";
import SpacesFeed from "@/components/social/SpacesFeed";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { motion, AnimatePresence } from "framer-motion";
import { getAvatarInitials } from "@/lib/utils";
import {
  Users, UserCheck, Heart, Sparkles, Loader2, ChevronDown, Search, X, FileText, Radio,
} from "lucide-react";

interface SocialSectionProps {
  userId: string;
  isOwnProfile: boolean;
  isPublic: boolean;
  initialTab?: "posts" | "activity" | "spaces" | "followers" | "following" | "suggestions";
}

const SocialSection = ({ userId, isOwnProfile, isPublic, initialTab }: SocialSectionProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"posts" | "activity" | "spaces" | "followers" | "following" | "suggestions">(initialTab || "posts");
  const [searchQuery, setSearchQuery] = useState("");
  const [myPostsOnly, setMyPostsOnly] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: postsCount = 0 } = useQuery({
    queryKey: ["social-posts-count", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("status_updates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return count || 0;
    },
  });

  const { data: likesCount = 0 } = useQuery({
    queryKey: ["social-likes-received-count", userId],
    queryFn: async () => {
      // Count total likes received on user's posts
      const { data: userStatuses } = await supabase
        .from("status_updates")
        .select("id")
        .eq("user_id", userId);
      if (!userStatuses || userStatuses.length === 0) return 0;
      const statusIds = userStatuses.map((s: any) => s.id);
      const { count } = await supabase
        .from("status_likes")
        .select("id", { count: "exact", head: true })
        .in("status_id", statusIds.slice(0, 50));
      return count || 0;
    },
  });

  const { data: followers = [], isLoading: loadingFollowers } = useQuery({
    queryKey: ["social-followers", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("id, follower_id, created_at")
        .eq("following_id", userId)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.follower_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, bio, verification_level").in("id", ids);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: map.get(f.follower_id) }));
    },
    enabled: expanded,
  });

  const { data: following = [], isLoading: loadingFollowing } = useQuery({
    queryKey: ["social-following", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("id, following_id, created_at")
        .eq("follower_id", userId)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.following_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, bio, verification_level").in("id", ids);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: map.get(f.following_id) }));
    },
    enabled: expanded,
  });

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery({
    queryKey: ["social-search", debouncedSearch],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, bio, verification_level")
        .eq("is_public", true)
        .ilike("display_name", `%${debouncedSearch}%`)
        .limit(20);
      return (data || []).filter((p: any) => p.id !== userId);
    },
    enabled: expanded && activeTab === "suggestions" && debouncedSearch.length >= 2,
  });

  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery({
    queryKey: ["follow-suggestions", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_follow_suggestions", {
        _user_id: userId,
        _limit: 15,
      });
      if (error) { console.error("follow suggestions error:", error); return []; }
      return data || [];
    },
    enabled: expanded && activeTab === "suggestions",
  });

  const renderUserRow = (uid: string, prof: any, index: number) => {
    const name = prof?.display_name || "Anonymous";
    const vLevel = (prof?.verification_level || "none") as VerificationLevel;
    return (
      <motion.div
        key={uid}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        className="glass rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => navigate(`/user/${uid}`)}
      >
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center">
            {prof?.avatar_url ? (
              <img src={resolveAvatarUrl(prof.avatar_url)} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-primary">{getAvatarInitials(name)}</span>
            )}
          </div>
          
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate flex items-center gap-1">
            {name}
            {vLevel !== "none" && <NftBadge level={vLevel} size={14} />}
          </p>
          {prof?.bio && <p className="text-[10px] text-muted-foreground truncate">{prof.bio}</p>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <FollowButton userId={uid} size="sm" />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full glass rounded-xl px-4 py-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
      >
        <span className="text-sm font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Social
        </span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {/* Stories */}
              <StoriesCarousel />

              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50 overflow-x-auto scrollbar-hide">
                {([
                  { key: "posts" as const, label: isOwnProfile && myPostsOnly ? "My Posts ✓" : `Posts (${postsCount})`, icon: FileText },
                  { key: "activity" as const, label: "Activity", icon: Heart },
                  { key: "spaces" as const, label: "Spaces", icon: Radio },
                  { key: "suggestions" as const, label: "For You", icon: Sparkles },
                ]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      if (t.key === "posts" && activeTab === "posts" && isOwnProfile && isFeatureEnabled("my_posts_filter")) {
                        setMyPostsOnly((prev) => !prev);
                      } else {
                        setActiveTab(t.key);
                        if (t.key !== "posts") setMyPostsOnly(false);
                      }
                    }}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all flex flex-col items-center gap-0.5 shrink-0 min-w-[48px] ${
                      activeTab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              {activeTab === "posts" && (
                <StatusFeed userId={userId} showComposer={isOwnProfile} onlyUserId={isOwnProfile && myPostsOnly ? userId : undefined} />
              )}

              {activeTab === "activity" && (
                <ActivityFeed userId={userId} isOwnProfile={isOwnProfile} isPublic={isPublic} />
              )}

              {activeTab === "spaces" && (
                <SpacesFeed />
              )}

              {activeTab === "followers" && (
                <div className="space-y-1.5">
                  {loadingFollowers ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : followers.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No followers yet</p>
                    </div>
                  ) : (
                    followers.map((f: any, i: number) => renderUserRow(f.follower_id, f.profile, i))
                  )}
                </div>
              )}

              {activeTab === "following" && (
                <div className="space-y-1.5">
                  {loadingFollowing ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                  ) : following.length === 0 ? (
                    <div className="text-center py-12">
                      <UserCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Not following anyone yet</p>
                      <button onClick={() => setActiveTab("suggestions")} className="mt-3 text-xs text-primary font-semibold hover:underline">
                        Discover people to follow →
                      </button>
                    </div>
                  ) : (
                    following.map((f: any, i: number) => renderUserRow(f.following_id, f.profile, i))
                  )}
                </div>
              )}

              {activeTab === "suggestions" && (
                <div className="space-y-1.5">
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name..."
                      className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                        <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>

                  {debouncedSearch.length >= 2 ? (
                    <>
                      {loadingSearch ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                      ) : searchResults.length === 0 ? (
                        <div className="text-center py-12">
                          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No users found for "{debouncedSearch}"</p>
                        </div>
                      ) : (
                        searchResults.map((s: any, i: number) => renderUserRow(s.id, s, i))
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground px-1 mb-2">Active traders you might want to follow</p>
                      {loadingSuggestions ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                      ) : suggestions.length === 0 ? (
                        <div className="text-center py-12">
                          <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No suggestions right now</p>
                        </div>
                      ) : (
                        suggestions.map((s: any, i: number) => renderUserRow(s.id, s, i))
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SocialSection;
