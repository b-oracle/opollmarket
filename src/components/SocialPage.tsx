import { useState, useMemo, useCallback } from "react";
import { getAvatarInitials } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollowCounts } from "@/hooks/useFollow";
import { useLiveSpacesCount } from "@/hooks/useLiveSpacesCount";
import FollowButton from "@/components/FollowButton";
import ActivityFeed from "@/components/ActivityFeed";
import StatusFeed from "@/components/social/StatusFeed";
import StoriesCarousel from "@/components/social/StoriesCarousel";
import SpacesFeed from "@/components/social/SpacesFeed";
import NftBadge, { isNftAvatar } from "@/components/NftBadge";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, UserCheck, Heart, Gift, Trophy,
  Sparkles, ChevronRight, ChevronLeft, Loader2, X, Search, FileText, Radio,
} from "lucide-react";

const ITEMS_PER_PAGE = 10;

interface SocialPageProps {
  open: boolean;
  onClose: () => void;
}

const SocialPage = ({ open, onClose }: SocialPageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const followCounts = useFollowCounts(user?.id);
  const { data: liveSpacesCount = 0 } = useLiveSpacesCount();
  const [activeTab, setActiveTab] = useState<"posts" | "activity" | "spaces" | "followers" | "following" | "suggestions">("posts");
  const [myPostsOnly, setMyPostsOnly] = useState(false);
  const [followersPage, setFollowersPage] = useState(1);
  const [followingPage, setFollowingPage] = useState(1);
  const [suggestionsPage, setSuggestionsPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSuggestionsPage(1);
    const timeout = setTimeout(() => setDebouncedSearch(value.trim().toLowerCase()), 300);
    return () => clearTimeout(timeout);
  }, []);

  // Search users query
  const { data: searchResults = [], isLoading: loadingSearch } = useQuery({
    queryKey: ["user-search", debouncedSearch],
    queryFn: async () => {
      if (!user || !debouncedSearch || debouncedSearch.length < 2) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, bio, is_public, username")
        .eq("is_public", true)
        .ilike("display_name", `%${debouncedSearch}%`)
        .neq("id", user.id)
        .limit(20);
      return data || [];
    },
    enabled: !!user && open && debouncedSearch.length >= 2,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, bio, is_public, username")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user && open,
  });

  // Followers list
  const { data: followers = [], isLoading: loadingFollowers } = useQuery({
    queryKey: ["social-followers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("follows")
        .select("id, follower_id, created_at")
        .eq("following_id", user.id)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.follower_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, username").in("id", ids);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: map.get(f.follower_id) }));
    },
    enabled: !!user && open,
  });

  // Following list
  const { data: following = [], isLoading: loadingFollowing } = useQuery({
    queryKey: ["social-following", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("follows")
        .select("id, following_id, created_at")
        .eq("follower_id", user.id)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.following_id);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_url, username").in("id", ids);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: map.get(f.following_id) }));
    },
    enabled: !!user && open,
  });

  // Follow suggestions: active users not already followed
  const followingIds = useMemo(() => following.map((f: any) => f.following_id), [following]);
  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery({
    queryKey: ["follow-suggestions", user?.id, followingIds.join(",")],
    queryFn: async () => {
      if (!user) return [];
      const { data: recentTraders } = await supabase
        .from("transactions")
        .select("user_id")
        .eq("type", "buy")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!recentTraders) return [];

      const exclude = new Set([user.id, ...followingIds]);
      const uniqueIds = [...new Set(recentTraders.map((t: any) => t.user_id))].filter(id => !exclude.has(id)).slice(0, 30);

      if (uniqueIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, bio, is_public, username")
        .in("id", uniqueIds)
        .eq("is_public", true);

      return profiles || [];
    },
    enabled: !!user && open,
  });

  const hasNft = isNftAvatar(profile?.avatar_url);
  const displayName = profile?.display_name || "Anonymous";

  const followersTotalPages = Math.max(1, Math.ceil(followers.length / ITEMS_PER_PAGE));
  const followingTotalPages = Math.max(1, Math.ceil(following.length / ITEMS_PER_PAGE));
  const suggestionsTotalPages = Math.max(1, Math.ceil(suggestions.length / ITEMS_PER_PAGE));

  const paginatedFollowers = followers.slice((followersPage - 1) * ITEMS_PER_PAGE, followersPage * ITEMS_PER_PAGE);
  const paginatedFollowing = following.slice((followingPage - 1) * ITEMS_PER_PAGE, followingPage * ITEMS_PER_PAGE);
  const paginatedSuggestions = suggestions.slice((suggestionsPage - 1) * ITEMS_PER_PAGE, suggestionsPage * ITEMS_PER_PAGE);

  const PaginationControls = ({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (fn: (p: number) => number) => void }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-center gap-3 py-3">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-medium text-muted-foreground">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="w-8 h-8 rounded-lg glass flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const renderUserRow = (userId: string, prof: any, index: number) => {
    const name = prof?.display_name || "Anonymous";
    const nft = isNftAvatar(prof?.avatar_url);
    return (
      <motion.div
        key={userId}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        className="glass rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => { onClose(); navigate(`/user/${prof?.username || userId}`); }}
      >
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center">
            {prof?.avatar_url ? (
              <img src={prof.avatar_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-primary">{getAvatarInitials(name)}</span>
            )}
          </div>
          
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate flex items-center gap-1">
            {name}
            {nft && <NftBadge size={14} />}
          </p>
          {prof?.bio && <p className="text-[10px] text-muted-foreground truncate">{prof.bio}</p>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <FollowButton userId={userId} size="sm" />
        </div>
      </motion.div>
    );
  };

  if (!user) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-background z-[61] overscroll-contain"
            style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" } as React.CSSProperties}
          >
            {/* Flex column layout – header stays fixed, content scrolls */}
            <div
              className="h-full flex flex-col overflow-hidden"
              style={{
                touchAction: "pan-y",
                overscrollBehavior: "contain",
              } as React.CSSProperties}
            >
            {/* Header */}
            <div
              className="shrink-0 bg-background/80 backdrop-blur-xl border-b border-border px-4 flex items-center gap-3 z-10"
              style={{ paddingTop: "calc(0.75rem + var(--safe-top))", paddingBottom: "0.75rem" }}
            >
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-bold flex-1">Social</h2>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              {/* Mini profile card */}
              <div className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/30 overflow-hidden flex items-center justify-center">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-primary">{getAvatarInitials(displayName, { maxChars: 2 })}</span>
                    )}
                  </div>
                  
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate flex items-center gap-1">
                    {displayName}
                    {hasNft && <NftBadge size={16} />}
                  </p>
                  {profile?.bio && <p className="text-[10px] text-muted-foreground line-clamp-1">{profile.bio}</p>}
                  <div className="flex gap-4 mt-1.5">
                    <span className="text-xs"><span className="font-bold">{followCounts.followers}</span> <span className="text-muted-foreground">followers</span></span>
                    <span className="text-xs"><span className="font-bold">{followCounts.following}</span> <span className="text-muted-foreground">following</span></span>
                  </div>
                </div>
                <button
                  onClick={() => { onClose(); navigate(`/user/${(profile as any)?.username || user.id}`); }}
                  className="w-8 h-8 rounded-full glass flex items-center justify-center shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Stories Carousel */}
              <StoriesCarousel />

              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50 overflow-x-auto scrollbar-hide">
                {([
                  { key: "posts", label: myPostsOnly ? "My Posts ✓" : "Posts", icon: FileText, badge: 0 },
                  { key: "activity", label: "Activity", icon: Heart, badge: 0 },
                  { key: "spaces", label: "Spaces", icon: Radio, badge: liveSpacesCount },
                  { key: "followers", label: `${followers.length}`, icon: Users, badge: 0 },
                  { key: "following", label: `${following.length}`, icon: UserCheck, badge: 0 },
                  { key: "suggestions", label: "For You", icon: Sparkles, badge: 0 },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      if (t.key === "posts" && activeTab === "posts") {
                        setMyPostsOnly((prev) => !prev);
                      } else {
                        setActiveTab(t.key);
                        if (t.key !== "posts") setMyPostsOnly(false);
                      }
                    }}
                    className={`relative flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all flex flex-col items-center gap-0.5 shrink-0 min-w-[52px] ${
                      activeTab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                    {t.badge > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[8px] font-bold shadow-[0_0_8px_hsl(var(--primary)/0.5)]">
                        {t.badge > 9 ? "9+" : t.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Content */}
              {activeTab === "posts" && (
                <StatusFeed showComposer onlyUserId={myPostsOnly ? user.id : undefined} />
              )}

              {activeTab === "activity" && (
                <ActivityFeed userId={user.id} isOwnProfile isPublic />
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
                    <>
                      {paginatedFollowers.map((f: any, i: number) => renderUserRow(f.follower_id, f.profile, i))}
                      <PaginationControls page={followersPage} totalPages={followersTotalPages} setPage={setFollowersPage} />
                    </>
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
                      <button
                        onClick={() => setActiveTab("suggestions")}
                        className="mt-3 text-xs text-primary font-semibold hover:underline"
                      >
                        Discover people to follow →
                      </button>
                    </div>
                  ) : (
                    <>
                      {paginatedFollowing.map((f: any, i: number) => renderUserRow(f.following_id, f.profile, i))}
                      <PaginationControls page={followingPage} totalPages={followingTotalPages} setPage={setFollowingPage} />
                    </>
                  )}
                </div>
              )}

              {activeTab === "suggestions" && (
                <div className="space-y-1.5">
                  {/* Search bar */}
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users by name..."
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-9 pr-9 h-10 rounded-xl bg-muted/50 border-border/50 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(""); setDebouncedSearch(""); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Search results or suggestions */}
                  {debouncedSearch.length >= 2 ? (
                    <>
                      <p className="text-xs text-muted-foreground px-1 mb-2">
                        Search results for "{debouncedSearch}"
                      </p>
                      {loadingSearch ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                      ) : searchResults.length === 0 ? (
                        <div className="text-center py-12">
                          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No users found</p>
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
                        <>
                          {paginatedSuggestions.map((s: any, i: number) => renderUserRow(s.id, s, i))}
                          <PaginationControls page={suggestionsPage} totalPages={suggestionsTotalPages} setPage={setSuggestionsPage} />
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SocialPage;
