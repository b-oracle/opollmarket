import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, UserCheck, Heart, MessageCircle, Search, Eye, EyeOff, Shield, TrendingUp, Share2, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import AdminPagination from "@/components/admin/AdminPagination";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
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
  const [totalFollows, setTotalFollows] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [followGrowth, setFollowGrowth] = useState<{ date: string; count: number }[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "profiles" | "top" | "links">("overview");

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchStats = useCallback(async () => {
    const fetchAllFollows = async () => {
      let allFollows: any[] = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await supabase.from("follows").select("created_at").order("created_at", { ascending: true }).range(page * 1000, (page + 1) * 1000 - 1);
        if (data && data.length > 0) {
          allFollows = [...allFollows, ...data];
          page++;
          if (data.length < 1000) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      return allFollows;
    };

    const [{ count: followCount }, { count: likeCount }, { count: commentCount }, followRows] = await Promise.all([
      supabase.from("follows").select("id", { count: "exact", head: true }),
      supabase.from("market_likes").select("id", { count: "exact", head: true }),
      supabase.from("comments").select("id", { count: "exact", head: true }),
      fetchAllFollows(),
    ]);
    setTotalFollows(followCount ?? 0);
    setTotalLikes(likeCount ?? 0);
    setTotalComments(commentCount ?? 0);

    // Follow growth over last 30 days
    const dayMap = new Map<string, number>();
    (followRows || []).forEach(f => {
      const day = f.created_at.slice(0, 10);
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    });
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const key = d.toISOString().slice(0, 10);
      return { date: d.toLocaleDateString("en", { month: "short", day: "numeric" }), count: dayMap.get(key) || 0 };
    });
    setFollowGrowth(last30);
  }, []);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase.from("profiles").select("id, display_name, email, avatar_url, bio, is_public, created_at", { count: "exact" }).order("created_at", { ascending: false });

    if (debouncedSearch.trim()) {
      const q = `%${debouncedSearch.trim()}%`;
      query = query.or(`display_name.ilike.${q},email.ilike.${q}`);
    }

    const { data: profileData, count } = await query.range(from, to);
    setTotalCount(count ?? 0);

    if (!profileData || profileData.length === 0) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    const userIds = profileData.map(p => p.id);

    // Fetch follow counts for displayed users
    const [{ data: followerCounts }, { data: followingCounts }] = await Promise.all([
      supabase.from("follows").select("following_id").in("following_id", userIds),
      supabase.from("follows").select("follower_id").in("follower_id", userIds),
    ]);

    const followerMap = new Map<string, number>();
    (followerCounts || []).forEach(f => followerMap.set(f.following_id, (followerMap.get(f.following_id) || 0) + 1));

    const followingMap = new Map<string, number>();
    (followingCounts || []).forEach(f => followingMap.set(f.follower_id, (followingMap.get(f.follower_id) || 0) + 1));

    setProfiles(profileData.map(p => ({
      ...p,
      followers_count: followerMap.get(p.id) || 0,
      following_count: followingMap.get(p.id) || 0,
    })));

    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  // Top followed users
  const topFollowed = useMemo(() => {
    return [...profiles].sort((a, b) => b.followers_count - a.followers_count).slice(0, 10);
  }, [profiles]);

  if (loading && profiles.length === 0) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const statCards = [
    { label: "Total Follows", value: totalFollows, icon: UserCheck, color: "text-primary" },
    { label: "Total Likes", value: totalLikes, icon: Heart, color: "text-pink-500" },
    { label: "Total Comments", value: totalComments, icon: MessageCircle, color: "text-blue-500" },
    { label: "Total Profiles", value: totalCount, icon: Users, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-primary" /> Social & Profiles</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <span className="text-xl font-bold">{c.value}</span>
          </div>
        ))}
      </div>

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
            <h3 className="text-sm font-semibold mb-4">Social Engagement Summary</h3>
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Followers/User</span>
                <span className="text-sm font-bold">{totalCount > 0 ? (totalFollows / totalCount).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Likes/User</span>
                <span className="text-sm font-bold">{totalCount > 0 ? (totalLikes / totalCount).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg Comments/User</span>
                <span className="text-sm font-bold">{totalCount > 0 ? (totalComments / totalCount).toFixed(1) : "0"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Public Profiles</span>
                <span className="text-sm font-bold">{profiles.filter(p => p.is_public).length} / {profiles.length}</span>
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
