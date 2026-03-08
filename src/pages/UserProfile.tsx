import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollow, useFollowCounts } from "@/hooks/useFollow";
import { useCopySettings } from "@/hooks/useCopySettings";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import NftBadge, { isNftAvatar } from "@/components/NftBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Heart, Trophy, Gift, UserPlus, UserMinus, Loader2,
  Crown, Medal, Award, Copy, Eye, EyeOff, Settings, Hexagon, ChevronRight,
  TrendingUp, TrendingDown, MessageCircle, Bookmark, Lock
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const formatDollar = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toFixed(2)}`;
};

const UserProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwnProfile = user?.id === id;
  const { isFollowing, loading: followLoading, toggleFollow } = useFollow(id);
  const followCounts = useFollowCounts(id);
  const { settings: copySettings, updateSettings } = useCopySettings(id);
  const [showCopySettings, setShowCopySettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"markets" | "predictions" | "activity">("markets");

  // Profile data
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["user-profile", id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, is_public, bio, created_at, wallet_address")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  // Markets created by user
  const { data: userMarkets = [] } = useQuery({
    queryKey: ["user-markets", id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from("markets")
        .select("id, title, image_url, category, yes_price, no_price, status, volume, participants, end_date, market_type")
        .eq("creator_wallet", id)
        .in("status", ["active", "ended", "resolved"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!id,
  });

  // User positions (predictions)
  const { data: userPositions = [] } = useQuery({
    queryKey: ["user-positions-public", id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from("positions")
        .select("id, market_id, side, shares, avg_price, option_id")
        .eq("user_id", id)
        .gt("shares", 0)
        .limit(20);
      return data || [];
    },
    enabled: !!id && (isOwnProfile || !!profile?.is_public),
  });

  // Likes count
  const { data: likesCount = 0 } = useQuery({
    queryKey: ["user-likes-count", id],
    queryFn: async () => {
      if (!id) return 0;
      const { count } = await supabase
        .from("market_likes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", id);
      return count || 0;
    },
    enabled: !!id,
  });

  // Referral count
  const { data: referralCount = 0 } = useQuery({
    queryKey: ["user-referral-count", id],
    queryFn: async () => {
      if (!id) return 0;
      const { count } = await supabase
        .from("referral_rewards")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", id);
      return count || 0;
    },
    enabled: !!id,
  });

  // Markets data for positions
  const marketIds = useMemo(() => userPositions.map((p: any) => p.market_id), [userPositions]);
  const { data: positionMarkets = [] } = useQuery({
    queryKey: ["position-markets", marketIds],
    queryFn: async () => {
      if (marketIds.length === 0) return [];
      const { data } = await supabase
        .from("markets")
        .select("id, title, yes_price, no_price, status, image_url")
        .in("id", marketIds);
      return data || [];
    },
    enabled: marketIds.length > 0,
  });

  const positionMarketMap = useMemo(
    () => new Map(positionMarkets.map((m: any) => [m.id, m])),
    [positionMarkets]
  );

  // User rank (simple: count users with more profit)
  const hasNftAvatar = isNftAvatar(profile?.avatar_url);
  const displayName = profile?.display_name || "Anonymous";

  if (profileLoading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <TopBar />
        <div className="max-w-lg mx-auto px-4 flex flex-col items-center justify-center" style={{ minHeight: "60vh", paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
          <Lock className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-bold mb-2">Profile Not Found</h2>
          <p className="text-sm text-muted-foreground mb-4">This user doesn't exist or their profile is private.</p>
          <button onClick={() => navigate(-1)} className="text-sm text-primary font-semibold">Go Back</button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!profile.is_public && !isOwnProfile) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <TopBar />
        <div className="max-w-lg mx-auto px-4" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center mb-4">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center py-16">
            <div className="relative mb-3">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
            <h2 className="text-lg font-bold">{displayName}</h2>
            <p className="text-sm text-muted-foreground mt-1">This profile is private</p>
            {!isOwnProfile && user && (
              <button
                onClick={toggleFollow}
                disabled={followLoading}
                className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2"
              >
                {followLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold truncate flex-1">{displayName}</h2>
        </div>

        {/* Profile Card */}
        <div className="glass rounded-2xl p-5 mb-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              {hasNftAvatar && <NftBadge className="absolute -bottom-0.5 -right-0.5" />}
              {hasNftAvatar && (
                <div className="absolute -top-1 -left-1 px-1.5 py-0.5 rounded-full bg-primary/20 border border-primary/30">
                  <span className="text-[8px] font-bold text-primary uppercase">Creator</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold truncate">{displayName}</h3>
                {hasNftAvatar && <Hexagon className="w-4 h-4 text-primary fill-primary/20 shrink-0" />}
              </div>
              {profile.bio && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{profile.bio}</p>}

              {/* Stats Row */}
              <div className="flex items-center gap-4 text-xs">
                <div className="text-center">
                  <p className="font-bold">{followCounts.followers}</p>
                  <p className="text-muted-foreground text-[10px]">Followers</p>
                </div>
                <div className="text-center">
                  <p className="font-bold">{followCounts.following}</p>
                  <p className="text-muted-foreground text-[10px]">Following</p>
                </div>
                <div className="text-center">
                  <p className="font-bold">{likesCount}</p>
                  <p className="text-muted-foreground text-[10px]">Likes</p>
                </div>
                <div className="text-center">
                  <p className="font-bold">{referralCount}</p>
                  <p className="text-muted-foreground text-[10px]">Referrals</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {!isOwnProfile && user && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={toggleFollow}
                disabled={followLoading}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                  isFollowing
                    ? "glass text-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {followLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isFollowing ? (
                  <UserMinus className="w-4 h-4" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {isFollowing ? "Following" : "Follow"}
              </button>
              {isFollowing && (
                <button
                  onClick={() => setShowCopySettings(!showCopySettings)}
                  className="px-4 py-2.5 rounded-xl glass font-semibold text-sm flex items-center gap-2 hover:bg-accent/50 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Trade
                </button>
              )}
            </div>
          )}
          {isOwnProfile && (
            <button
              onClick={() => navigate("/profile")}
              className="w-full mt-4 py-2.5 rounded-xl glass font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Settings className="w-4 h-4" /> Edit Profile
            </button>
          )}
        </div>

        {/* Copy Trading Settings */}
        <AnimatePresence>
          {showCopySettings && isFollowing && !isOwnProfile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="glass rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Copy className="w-4 h-4 text-primary" /> Copy Trading Settings
                </h4>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Copy Predictions</p>
                    <p className="text-[10px] text-muted-foreground">Get notified when they predict on markets</p>
                  </div>
                  <Switch
                    checked={copySettings?.copy_predictions ?? false}
                    onCheckedChange={(v) => updateSettings({ copy_predictions: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Copy Quick Trades</p>
                    <p className="text-[10px] text-muted-foreground">Follow their quick trade plays</p>
                  </div>
                  <Switch
                    checked={copySettings?.copy_quick_trades ?? false}
                    onCheckedChange={(v) => updateSettings({ copy_quick_trades: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Auto-Copy</p>
                    <p className="text-[10px] text-muted-foreground">Automatically place the same bets</p>
                  </div>
                  <Switch
                    checked={copySettings?.auto_copy ?? false}
                    onCheckedChange={(v) => updateSettings({ auto_copy: v })}
                  />
                </div>
                {copySettings?.auto_copy && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Amount per Trade ($)</label>
                    <input
                      type="number"
                      value={copySettings?.max_amount ?? 10}
                      onChange={(e) => updateSettings({ max_amount: Math.max(1, Number(e.target.value)) })}
                      className="w-full bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      min={1}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-4">
          {(["markets", "predictions", "activity"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                activeTab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "markets" ? `Markets (${userMarkets.length})` : t === "predictions" ? "Predictions" : "Activity"}
            </button>
          ))}
        </div>

        {/* Markets Grid (Instagram-like) */}
        {activeTab === "markets" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
            {userMarkets.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <p className="text-sm text-muted-foreground">No markets created yet</p>
              </div>
            ) : (
              userMarkets.map((market: any) => (
                <motion.div
                  key={market.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group"
                  onClick={() => navigate(`/market/${market.id}`)}
                >
                  {market.image_url ? (
                    <img src={market.image_url} alt={market.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center p-2">
                      <span className="text-xs font-semibold text-center line-clamp-3">{market.title}</span>
                    </div>
                  )}
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <div className="w-full">
                      <p className="text-[10px] font-bold text-foreground truncate">{market.title}</p>
                      <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                        <span>${Number(market.volume).toFixed(0)} vol</span>
                        <span>·</span>
                        <span>{market.participants} predictors</span>
                      </div>
                    </div>
                  </div>
                  {/* Status Badge */}
                  <div className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                    market.status === "active" ? "bg-primary/80 text-primary-foreground" :
                    market.status === "resolved" ? "bg-muted text-foreground" : "bg-destructive/80 text-white"
                  }`}>
                    {market.status === "active" ? "Live" : market.status === "resolved" ? "Resolved" : "Ended"}
                  </div>
                  {/* Yes/No prices */}
                  <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-primary/80 text-primary-foreground text-[8px] font-bold">
                      Y {(market.yes_price * 100).toFixed(0)}¢
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-destructive/80 text-white text-[8px] font-bold">
                      N {(market.no_price * 100).toFixed(0)}¢
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* Predictions Tab */}
        {activeTab === "predictions" && (
          <div className="space-y-2 mb-6">
            {userPositions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">No active predictions</p>
              </div>
            ) : (
              userPositions.map((pos: any) => {
                const market = positionMarketMap.get(pos.market_id) as any;
                if (!market) return null;
                const currentPrice = pos.side === "yes" ? market.yes_price : market.no_price;
                const pnl = pos.shares * (currentPrice - pos.avg_price);
                return (
                  <div
                    key={pos.id}
                    onClick={() => navigate(`/market/${pos.market_id}`)}
                    className="glass rounded-xl p-3.5 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      pos.side === "yes" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                    }`}>
                      {pos.side === "yes" ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{market.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {pos.shares.toFixed(1)} shares @ {(pos.avg_price * 100).toFixed(0)}¢ · {pos.side.toUpperCase()}
                      </p>
                    </div>
                    <p className={`text-sm font-bold ${pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                      {pnl >= 0 ? "+" : ""}{formatDollar(pnl)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === "activity" && <ActivityFeed userId={id!} isOwnProfile={isOwnProfile} isPublic={!!profile?.is_public} />}
      </div>
      <BottomNav />
    </div>
  );
};

export default UserProfile;
