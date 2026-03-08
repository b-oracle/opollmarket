import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import FollowButton from "@/components/FollowButton";
import { ArrowLeft, Users, UserCheck, Loader2, Search, Bell } from "lucide-react";
import { motion } from "framer-motion";
import NftBadge, { isNftAvatar } from "@/components/NftBadge";

const LAST_SEEN_KEY = "followers_last_seen";

const Followers = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<"followers" | "following">("followers");
  const [search, setSearch] = useState("");

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
        .select("id, display_name, avatar_url")
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
        .select("id, display_name, avatar_url")
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

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-dvh bg-background" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
      <TopBar />
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
            Followers ({followers.length})
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
          <div className="space-y-1.5">
            {filtered.map((item: any, i: number) => {
              const profile = item.profile;
              const userId = tab === "followers" ? item.follower_id : item.following_id;
              const name = profile?.display_name || "Anonymous";
              const hasNft = isNftAvatar(profile?.avatar_url);
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
                    {hasNft && <NftBadge className="absolute -bottom-0.5 -right-0.5 scale-75" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{name}</p>
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
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default Followers;
