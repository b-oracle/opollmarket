import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import FollowButton from "@/components/FollowButton";
import { ArrowLeft, Users, UserCheck, Loader2, Search, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";

const LAST_SEEN_KEY = "followers_last_seen";
const ITEMS_PER_PAGE = 10;
const PULL_THRESHOLD = 60;

const Followers = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"followers" | "following">("followers");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pull-to-refresh
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  const handlePullStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || container.scrollTop > 5 || refreshing) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, [refreshing]);

  const handlePullMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return;
    const container = containerRef.current;
    if (!container || container.scrollTop > 5) {
      isPulling.current = false;
      setPulling(false);
      setPullDistance(0);
      return;
    }
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY > 0) {
      const dampened = Math.min(deltaY * 0.45, 120);
      setPulling(true);
      setPullDistance(dampened);
      if (dampened >= PULL_THRESHOLD) navigator.vibrate?.(15);
    }
  }, [refreshing]);

  const handlePullEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(50);
      await queryClient.invalidateQueries({ queryKey: ["my-followers", user?.id] });
      await queryClient.invalidateQueries({ queryKey: ["my-following", user?.id] });
      setRefreshing(false);
    }
    setPulling(false);
    setPullDistance(0);
  }, [pullDistance, refreshing, queryClient, user?.id]);

  // Reset page on tab/search change
  useEffect(() => { setPage(1); }, [tab, search]);

  // Track last seen timestamp for new follower badge
  const [lastSeen, setLastSeen] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_SEEN_KEY); } catch { return null; }
  });

  // Mark as seen when viewing followers tab
  useEffect(() => {
    if (tab === "followers" && user) {
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SEEN_KEY, now);
      setLastSeen(now);
    }
  }, [tab, user]);

  const { data: followers = [], isLoading: loadingFollowers } = useQuery({
    queryKey: ["my-followers", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("follows")
        .select("id, follower_id, created_at")
        .eq("following_id", user.id)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.follower_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", ids);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: profileMap.get(f.follower_id) || null }));
    },
    enabled: !!user,
  });

  const { data: following = [], isLoading: loadingFollowing } = useQuery({
    queryKey: ["my-following", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("follows")
        .select("id, following_id, created_at")
        .eq("follower_id", user.id)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return [];
      const ids = data.map((f: any) => f.following_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", ids);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((f: any) => ({ ...f, profile: profileMap.get(f.following_id) || null }));
    },
    enabled: !!user,
  });

  const isLoading = tab === "followers" ? loadingFollowers : loadingFollowing;
  const list = tab === "followers" ? followers : following;
  const filtered = search
    ? list.filter((item: any) =>
        item.profile?.display_name?.toLowerCase().includes(search.toLowerCase())
      )
    : list;

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedList = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Count new followers since last seen
  const newFollowerCount = useMemo(() => {
    if (!lastSeen || tab !== "followers") return 0;
    return followers.filter((f: any) => new Date(f.created_at) > new Date(lastSeen)).length;
  }, [followers, lastSeen, tab]);

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="min-h-dvh bg-background overflow-y-auto overscroll-contain"
      style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      <TopBar />

      {/* Pull-to-refresh indicator */}
      <AnimatePresence>
        {(pulling || refreshing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center justify-center"
            style={{ top: 'calc(3.5rem + env(safe-area-inset-top) + 8px)' }}
          >
            <motion.div
              animate={refreshing ? { rotate: 360 } : { rotate: pullDistance * 3 }}
              transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : { type: "spring" }}
              className={`w-8 h-8 rounded-full glass flex items-center justify-center shadow-lg ${pullDistance >= PULL_THRESHOLD || refreshing ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <RefreshCw className="w-4 h-4" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-lg md:max-w-2xl mx-auto px-3 sm:px-4" style={{ paddingTop: "calc(5rem + env(safe-area-inset-top))" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold flex-1">Connections</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-4">
          <button
            onClick={() => setTab("followers")}
            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === "followers" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="relative">
              Followers ({followers.length})
              {newFollowerCount > 0 && tab !== "followers" && (
                <span className="absolute -top-2 -right-4 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                  {newFollowerCount}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setTab("following")}
            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === "following" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Following ({following.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Users className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "No results found" : tab === "followers" ? "No followers yet" : "Not following anyone yet"}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {paginatedList.map((item: any, i: number) => {
                const profile = item.profile;
                const userId = tab === "followers" ? item.follower_id : item.following_id;
                const name = profile?.display_name || "Anonymous";
                const vLevel = (profile?.verification_level || "none") as VerificationLevel;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="glass rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
                    onClick={() => navigate(`/user/${userId}`)}
                  >
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center">
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      {vLevel !== "none" && <NftBadge level={vLevel} className="absolute -bottom-0.5 -right-0.5 scale-75" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate flex items-center gap-1">
                        {name}
                        {vLevel !== "none" && <NftBadge level={vLevel} size={14} />}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <FollowButton userId={userId} size="sm" />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
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
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default Followers;
