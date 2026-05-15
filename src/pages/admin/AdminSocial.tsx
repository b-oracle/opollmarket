import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, UserCheck, Heart, MessageCircle, Search, Eye, EyeOff, TrendingUp, Mail, Gift, Radio, BookOpen, Share2, BarChart3, Megaphone, Mic2, ImageIcon, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import AdminPagination from "@/components/admin/AdminPagination";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import AdminSocialLinks from "@/components/admin/AdminSocialLinks";

const PAGE_SIZE = 20;

interface ProfileRow {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  created_at: string;
  followers_count: number;
  following_count: number;
}

const AdminSocial = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "profiles" | "top" | "links">("overview");

  // Stats
  const [stats, setStats] = useState({
    totalFollows: 0,
    totalLikes: 0,
    totalComments: 0,
    totalViews: 0,
    dmConversations: 0,
    dmMessages: 0,
    dmGiftsTotal: 0,
    dmCalls: 0,
    // New stats
    totalPosts: 0,
    totalStatusComments: 0,
    totalStatusLikes: 0,
    totalReposts: 0,
    totalStories: 0,
    totalStoryViews: 0,
    totalSpaces: 0,
    liveSpaces: 0,
    totalSpaceMessages: 0,
    totalSpaceGifts: 0,
    spaceGiftVolume: 0,
    totalCommunityMessages: 0,
    totalCommunityMembers: 0,
    totalSocialAds: 0,
    totalBookmarks: 0,
  });

  const [followGrowth, setFollowGrowth] = useState<{ date: string; count: number }[]>([]);
  const [postGrowth, setPostGrowth] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchStats = useCallback(async () => {
    // Batch all count queries
    const [
      { count: followCount },
      { count: likeCount },
      { count: commentCount },
      { count: viewCount },
      { count: dmConvoCount },
      { count: dmMsgCount },
      { count: dmCallCount },
      { count: postCount },
      { count: statusCommentCount },
      { count: statusLikeCount },
      { count: repostCount },
      { count: storyCount },
      { count: storyViewCount },
      { count: spaceCount },
      { count: liveSpaceCount },
      { count: spaceMsgCount },
      { count: spaceGiftCount },
      { count: communityMsgCount },
      { count: communityMemberCount },
      { count: socialAdCount },
      { count: bookmarkCount },
    ] = await Promise.all([
      supabase.from("follows").select("id", { count: "exact", head: true }),
      supabase.from("market_likes").select("id", { count: "exact", head: true }),
      supabase.from("comments").select("id", { count: "exact", head: true }),
      supabase.from("status_views" as any).select("id", { count: "exact", head: true }),
      supabase.from("dm_conversations").select("id", { count: "exact", head: true }),
      supabase.from("dm_messages").select("id", { count: "exact", head: true }),
      supabase.from("dm_calls").select("id", { count: "exact", head: true }),
      supabase.from("status_updates").select("id", { count: "exact", head: true }),
      supabase.from("status_comments").select("id", { count: "exact", head: true }),
      supabase.from("status_likes").select("id", { count: "exact", head: true }),
      supabase.from("status_reposts").select("id", { count: "exact", head: true }),
      supabase.from("stories").select("id", { count: "exact", head: true }),
      supabase.from("story_views").select("id", { count: "exact", head: true }),
      supabase.from("spaces").select("id", { count: "exact", head: true }),
      supabase.from("spaces").select("id", { count: "exact", head: true }).eq("status", "live"),
      supabase.from("space_messages").select("id", { count: "exact", head: true }),
      supabase.from("space_gifts").select("id", { count: "exact", head: true }),
      supabase.from("community_messages").select("id", { count: "exact", head: true }),
      supabase.from("community_memberships").select("id", { count: "exact", head: true }),
      supabase.from("social_ads").select("id", { count: "exact", head: true }),
      supabase.from("bookmarks").select("id", { count: "exact", head: true }),
    ]);

    // DM gift total (batched)
    let dmGiftsTotal = 0;
    let gFrom = 0;
    while (true) {
      const { data, error } = await supabase.from("dm_messages").select("gift_amount").not("gift_amount", "is", null).gt("gift_amount", 0).range(gFrom, gFrom + 999);
      if (error || !data || data.length === 0) break;
      dmGiftsTotal += data.reduce((s, r) => s + Number(r.gift_amount), 0);
      if (data.length < 1000) break;
      gFrom += 1000;
    }

    // Space gift volume (batched)
    let spaceGiftVolume = 0;
    let sgFrom = 0;
    while (true) {
      const { data, error } = await supabase.from("space_gifts").select("amount").range(sgFrom, sgFrom + 999);
      if (error || !data || data.length === 0) break;
      spaceGiftVolume += data.reduce((s, r) => s + Number(r.amount), 0);
      if (data.length < 1000) break;
      sgFrom += 1000;
    }

    setStats({
      totalFollows: followCount ?? 0,
      totalLikes: likeCount ?? 0,
      totalComments: commentCount ?? 0,
      totalViews: viewCount ?? 0,
      dmConversations: dmConvoCount ?? 0,
      dmMessages: dmMsgCount ?? 0,
      dmGiftsTotal,
      dmCalls: dmCallCount ?? 0,
      totalPosts: postCount ?? 0,
      totalStatusComments: statusCommentCount ?? 0,
      totalStatusLikes: statusLikeCount ?? 0,
      totalReposts: repostCount ?? 0,
      totalStories: storyCount ?? 0,
      totalStoryViews: storyViewCount ?? 0,
      totalSpaces: spaceCount ?? 0,
      liveSpaces: liveSpaceCount ?? 0,
      totalSpaceMessages: spaceMsgCount ?? 0,
      totalSpaceGifts: spaceGiftCount ?? 0,
      spaceGiftVolume,
      totalCommunityMessages: communityMsgCount ?? 0,
      totalCommunityMembers: communityMemberCount ?? 0,
      totalSocialAds: socialAdCount ?? 0,
      totalBookmarks: bookmarkCount ?? 0,
    });

    // Follow growth (30 days)
    const fetchGrowthData = async (table: string) => {
      let allRows: any[] = [];
      let p = 0;
      while (true) {
        const { data } = await (supabase.from(table as any) as any).select("created_at").order("created_at", { ascending: true }).range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < 1000) break;
        p++;
      }
      return allRows;
    };

    const [followRows, postRows] = await Promise.all([
      fetchGrowthData("follows"),
      fetchGrowthData("status_updates"),
    ]);

    const buildGrowth = (rows: any[]) => {
      const dayMap = new Map<string, number>();
      rows.forEach(r => {
        const day = r.created_at.slice(0, 10);
        dayMap.set(day, (dayMap.get(day) || 0) + 1);
      });
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const key = d.toISOString().slice(0, 10);
        return { date: d.toLocaleDateString("en", { month: "short", day: "numeric" }), count: dayMap.get(key) || 0 };
      });
    };

    setFollowGrowth(buildGrowth(followRows));
    setPostGrowth(buildGrowth(postRows));
  }, []);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;

    // Use SECURITY DEFINER admin search RPC since email is not directly readable.
    const { data: rpcData } = await supabase.rpc("admin_search_profiles", {
      _term: debouncedSearch.trim() || null,
      _limit: PAGE_SIZE,
      _offset: from,
    });

    const row: any = Array.isArray(rpcData) ? rpcData[0] : null;
    const profileData: any[] = Array.isArray(row?.rows) ? row.rows : [];
    const count = Number(row?.total_count) || 0;
    setTotalCount(count);

    if (!profileData || profileData.length === 0) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    const userIds = profileData.map((p: any) => p.id);

    // Batch fetch follower/following counts to handle >1000 rows
    const batchFetchFollows = async (column: string, ids: string[]) => {
      const map = new Map<string, number>();
      let from = 0;
      while (true) {
        const { data } = await (supabase.from("follows") as any).select(column).in(column, ids).range(from, from + 999);
        if (!data || data.length === 0) break;
        data.forEach((f: any) => map.set(f[column], (map.get(f[column]) || 0) + 1));
        if (data.length < 1000) break;
        from += 1000;
      }
      return map;
    };

    const [followerMap, followingMap] = await Promise.all([
      batchFetchFollows("following_id", userIds),
      batchFetchFollows("follower_id", userIds),
    ]);

    setProfiles(profileData.map(p => ({
      ...p,
      followers_count: followerMap.get(p.id) || 0,
      following_count: followingMap.get(p.id) || 0,
    })));

    setLoading(false);
  }, [page, debouncedSearch]);

  // Fetch global top followed users (not just current page)
  const [topFollowed, setTopFollowed] = useState<ProfileRow[]>([]);
  const fetchTopFollowed = useCallback(async () => {
    // Get all follows, count by following_id
    const countMap = new Map<string, number>();
    let from = 0;
    while (true) {
      const { data } = await (supabase.from("follows") as any).select("following_id").range(from, from + 999);
      if (!data || data.length === 0) break;
      data.forEach((f: any) => countMap.set(f.following_id, (countMap.get(f.following_id) || 0) + 1));
      if (data.length < 1000) break;
      from += 1000;
    }
    // Sort and take top 10
    const topIds = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topIds.length === 0) { setTopFollowed([]); return; }

    const { data: topProfiles } = await supabase.from("profiles").select("id, display_name, avatar_url, is_public, created_at").in("id", topIds.map(t => t[0]));

    const result: ProfileRow[] = topIds.map(([uid, count]) => {
      const p = (topProfiles || []).find((pr: any) => pr.id === uid);
      return {
        id: uid,
        display_name: p?.display_name || "Anonymous",
        avatar_url: p?.avatar_url || null,
        is_public: p?.is_public ?? true,
        created_at: p?.created_at || "",
        followers_count: count,
        following_count: 0,
      } as ProfileRow;
    });
    setTopFollowed(result);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);
  useEffect(() => { fetchTopFollowed(); }, [fetchTopFollowed]);

  if (loading && profiles.length === 0) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const statCards = [
    // Social Feed
    { label: "Posts", value: stats.totalPosts, icon: BookOpen, color: "text-primary", section: "Feed" },
    { label: "Post Likes", value: stats.totalStatusLikes, icon: Heart, color: "text-pink-500", section: "Feed" },
    { label: "Post Comments", value: stats.totalStatusComments, icon: MessageCircle, color: "text-blue-500", section: "Feed" },
    { label: "Reposts", value: stats.totalReposts, icon: Share2, color: "text-emerald-500", section: "Feed" },
    // Stories
    { label: "Stories", value: stats.totalStories, icon: ImageIcon, color: "text-amber-500", section: "Stories" },
    { label: "Story Views", value: stats.totalStoryViews, icon: Eye, color: "text-amber-400", section: "Stories" },
    // Social engagement
    { label: "Follows", value: stats.totalFollows, icon: UserCheck, color: "text-primary", section: "Engagement" },
    { label: "Market Likes", value: stats.totalLikes, icon: Heart, color: "text-pink-500", section: "Engagement" },
    { label: "Market Comments", value: stats.totalComments, icon: MessageCircle, color: "text-blue-500", section: "Engagement" },
    { label: "Bookmarks", value: stats.totalBookmarks, icon: BookOpen, color: "text-violet-500", section: "Engagement" },
    { label: "Social Views", value: stats.totalViews, icon: BarChart3, color: "text-cyan-500", section: "Engagement" },
    { label: "Social Ads", value: stats.totalSocialAds, icon: Megaphone, color: "text-orange-500", section: "Engagement" },
    // DMs
    { label: "DM Chats", value: stats.dmConversations, icon: Mail, color: "text-indigo-500", section: "DMs" },
    { label: "DM Messages", value: stats.dmMessages, icon: MessageCircle, color: "text-violet-500", section: "DMs" },
    { label: "DM Calls", value: stats.dmCalls, icon: Mic2, color: "text-blue-400", section: "DMs" },
    { label: "DM Gifts", value: `$${stats.dmGiftsTotal.toFixed(0)}`, icon: Gift, color: "text-rose-500", section: "DMs" },
    // Spaces
    { label: "Total Spaces", value: stats.totalSpaces, icon: Radio, color: "text-primary", section: "Spaces" },
    { label: "Live Now", value: stats.liveSpaces, icon: Radio, color: "text-emerald-500", section: "Spaces" },
    { label: "Space Messages", value: stats.totalSpaceMessages, icon: MessageSquare, color: "text-blue-400", section: "Spaces" },
    { label: "Space Gifts", value: `$${stats.spaceGiftVolume.toFixed(0)}`, icon: Gift, color: "text-rose-500", section: "Spaces" },
    // Communities
    { label: "Community Members", value: stats.totalCommunityMembers, icon: Users, color: "text-emerald-500", section: "Communities" },
    { label: "Community Messages", value: stats.totalCommunityMessages, icon: MessageCircle, color: "text-blue-500", section: "Communities" },
    // Profiles
    { label: "Total Profiles", value: totalCount, icon: Users, color: "text-muted-foreground", section: "Profiles" },
  ];

  const sections = ["Feed", "Stories", "Engagement", "DMs", "Spaces", "Communities", "Profiles"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Social & Profiles</h1>

      {/* Stats grouped by section */}
      {sections.map(section => {
        const cards = statCards.filter(c => c.section === section);
        if (cards.length === 0) return null;
        return (
          <div key={section}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{section}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {cards.map(c => (
                <div key={c.label} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{c.label}</span>
                    <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
                  </div>
                  <span className="text-lg font-bold">{typeof c.value === "number" ? c.value.toLocaleString() : c.value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 w-fit flex-wrap">
        {(["overview", "profiles", "top", "links"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${activeTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t === "top" ? "Top Users" : t === "links" ? "Social Links" : t}</button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4">Follow Growth (30 Days)</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={followGrowth}>
                  <defs>
                    <linearGradient id="fillFollows" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Area type="monotone" dataKey="count" name="New Follows" stroke="hsl(var(--primary))" fill="url(#fillFollows)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4">Post Activity (30 Days)</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postGrowth}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="count" name="Posts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-4">Engagement Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Followers/User</span>
                <span className="text-sm font-bold">{totalCount > 0 ? (stats.totalFollows / totalCount).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Posts/User</span>
                <span className="text-sm font-bold">{totalCount > 0 ? (stats.totalPosts / totalCount).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Likes/Post</span>
                <span className="text-sm font-bold">{stats.totalPosts > 0 ? (stats.totalStatusLikes / stats.totalPosts).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Comments/Post</span>
                <span className="text-sm font-bold">{stats.totalPosts > 0 ? (stats.totalStatusComments / stats.totalPosts).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg DM Msgs/Chat</span>
                <span className="text-sm font-bold">{stats.dmConversations > 0 ? (stats.dmMessages / stats.dmConversations).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Gift Volume</span>
                <span className="text-sm font-bold text-rose-500">${(stats.dmGiftsTotal + stats.spaceGiftVolume).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Public Profiles</span>
                <span className="text-sm font-bold">{profiles.filter(p => p.is_public).length} / {profiles.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Repost Rate</span>
                <span className="text-sm font-bold">{stats.totalPosts > 0 ? ((stats.totalReposts / stats.totalPosts) * 100).toFixed(1) : "0"}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Story View Rate</span>
                <span className="text-sm font-bold">{stats.totalStories > 0 ? (stats.totalStoryViews / stats.totalStories).toFixed(1) : "0"} views/story</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "profiles" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Bio</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Visibility</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Followers</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Following</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Joined</th>
                </tr></thead>
                <tbody>
                  {profiles.map(p => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {(p.display_name || "?")[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-xs truncate max-w-[120px]">{p.display_name || "Anonymous"}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">{p.bio || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {p.is_public ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500"><Eye className="w-3 h-3" /> Public</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"><EyeOff className="w-3 h-3" /> Private</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-xs">{p.followers_count}</td>
                      <td className="px-4 py-3 text-center font-semibold text-xs">{p.following_count}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {profiles.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalCount > PAGE_SIZE && (
              <div className="p-4 border-t border-border">
                <AdminPagination page={page} totalItems={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "top" && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Most Followed Users</h3>
          {topFollowed.length > 0 ? (
            <div className="space-y-3">
              {topFollowed.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {(p.display_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{p.display_name || "Anonymous"}</span>
                      <span className="text-xs font-semibold text-primary">{p.followers_count} followers</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{p.following_count} following · {p.is_public ? "Public" : "Private"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>}
        </div>
      )}

      {activeTab === "links" && <AdminSocialLinks />}
    </div>
  );
};

export default AdminSocial;
