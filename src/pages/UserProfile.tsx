import { useState, useMemo, useRef, useCallback } from "react";
import { getAvatarInitials } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import ActivityFeed from "@/components/ActivityFeed";
import SocialSection from "@/components/SocialSection";
import MutualFollowers from "@/components/MutualFollowers";
import ShareModal from "@/components/ShareModal";
import ProfileShareCard from "@/components/ProfileShareCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollow, useFollowCounts } from "@/hooks/useFollow";
import { useCopySettings } from "@/hooks/useCopySettings";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Heart, Trophy, Gift, UserPlus, UserMinus, Loader2,
  Crown, Medal, Award, Copy, Eye, EyeOff, Settings, Hexagon, ChevronRight,
  TrendingUp, TrendingDown, MessageCircle, Bookmark, Lock, Share2, Zap, Flame, ShieldCheck, RefreshCw
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getCanonicalOrigin } from "@/lib/canonical";

const formatDollar = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toFixed(2)}`;
};



const UserProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
  // We'll resolve the actual profile id after fetching
  const [resolvedId, setResolvedId] = useState<string | null>(isUUID ? (id ?? null) : null);
  const profileUserId = resolvedId || id;
  const isOwnProfile = user?.id === profileUserId;
  const { isFollowing, loading: followLoading, toggleFollow } = useFollow(profileUserId);
  const followCounts = useFollowCounts(profileUserId);
  const { settings: copySettings, updateSettings } = useCopySettings(id);
  const { isFeatureEnabled } = useFeatureToggles();
  const copyTradingEnabled = isFeatureEnabled("copy_trading");
  const [showCopySettings, setShowCopySettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"markets" | "predictions" | "rank">("markets");
  const [shareOpen, setShareOpen] = useState(false);
  const profileCardRef = useRef<HTMLDivElement>(null);
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { pulling, pullDistance, refreshing, pullProgress, spinControls, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-profile", id] });
      await queryClient.invalidateQueries({ queryKey: ["user-markets", profileUserId] });
      await queryClient.invalidateQueries({ queryKey: ["user-positions-public", profileUserId] });
      await queryClient.invalidateQueries({ queryKey: ["user-likes-count", profileUserId] });
      await queryClient.invalidateQueries({ queryKey: ["user-leaderboard-ranks", profileUserId] });
    },
    scrollRef: containerRef,
  });

  const handleFollowClick = useCallback(() => {
    if (isFollowing) {
      setShowUnfollowConfirm(true);
    } else {
      toggleFollow();
    }
  }, [isFollowing, toggleFollow]);

  const handleConfirmUnfollow = useCallback(() => {
    setShowUnfollowConfirm(false);
    toggleFollow();
  }, [toggleFollow]);

  // Profile data — include user?.id in queryKey so it re-fetches once auth resolves
  // (anon can only see is_public=true profiles via RLS)
  const { data: profile, isLoading: profileLoading, isFetching: profileFetching, isError: profileError } = useQuery({
    queryKey: ["user-profile", id, user?.id ?? "anon"],
    queryFn: async () => {
      if (!id) return null;
      const { data: { session } } = await supabase.auth.getSession();
      const query = supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, is_public, bio, created_at, wallet_address, verification_level, twitter_username, twitter_id");

      const { data, error } = await (isUUID
        ? query.eq("id", id)
        : query.eq("username", id.toLowerCase())
      ).maybeSingle();

      if (!data && !error && session) {
        throw new Error("Profile not found — retrying");
      }
      if (error) throw error;
      if (data && data.id !== resolvedId) {
        setResolvedId(data.id);
      }
      return data ?? null;
    },
    enabled: !!id && !authLoading,
    retry: 3,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
    staleTime: 10_000,
    refetchOnMount: true,
  });

  const referralProfileId = profile?.id ?? (isUUID ? id ?? null : null);

  // Markets created by user
  const { data: userMarkets = [] } = useQuery({
    queryKey: ["user-markets", profileUserId],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from("markets")
        .select("id, title, image_url, category, yes_price, no_price, status, volume, participants, end_date, market_type")
        .eq("creator_wallet", profileUserId)
        .or("is_crypto_round.is.null,is_crypto_round.eq.false")
        .in("status", ["active", "ended", "resolved"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!profileUserId,
  });

  // User positions (predictions)
  const { data: userPositions = [] } = useQuery({
    queryKey: ["user-positions-public", profileUserId],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from("positions")
        .select("id, market_id, side, shares, avg_price, option_id, market_options(label, price)")
        .eq("user_id", profileUserId)
        .gt("shares", 0)
        .limit(20);
      return data || [];
    },
    enabled: !!profileUserId && (isOwnProfile || !!profile?.is_public),
  });

  // Total trades count (predictions + quick trades) via security-definer function
  const { data: tradeData = { predictions: 0, quick_trades: 0, total: 0 } } = useQuery({
    queryKey: ["user-trades-count", profileUserId],
    queryFn: async () => {
      if (!id) return { predictions: 0, quick_trades: 0, total: 0 };
      const { data, error } = await supabase.rpc("get_user_trade_count", { _user_id: profileUserId });
      if (error || !data || !data[0]) return { predictions: 0, quick_trades: 0, total: 0 };
      const row = data[0];
      return {
        predictions: Number(row.predictions) || 0,
        quick_trades: Number(row.quick_trades) || 0,
        total: (Number(row.predictions) || 0) + (Number(row.quick_trades) || 0),
      };
    },
    enabled: !!profileUserId,
  });

  // Referral count
  const { data: referralCount = 0 } = useQuery({
    queryKey: ["user-referral-count", referralProfileId],
    queryFn: async () => {
      if (!referralProfileId) return 0;
      const { data, error } = await supabase.rpc("get_user_referral_count" as any, {
        _user_id: referralProfileId,
      } as any);
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!referralProfileId && !!user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Leaderboard ranks
  const { data: leaderboardRanks, isLoading: ranksLoading } = useQuery({
    queryKey: ["user-leaderboard-ranks", profileUserId],
    queryFn: async () => {
      if (!id) return null;

      // Prediction PnL rank: use the server-side RPC for consistency
      const { data: predLeaderboard } = await supabase.rpc("get_prediction_leaderboard", { _limit: 500, _sort: "pnl" } as any);
      let predictionRank: number | null = null;
      if (predLeaderboard && Array.isArray(predLeaderboard)) {
        const idx = predLeaderboard.findIndex((r: any) => r.user_id === profileUserId);
        predictionRank = idx >= 0 ? idx + 1 : null;
      }

      // Referral rank
      const { data: allReferrers } = await supabase
        .from("referral_rewards")
        .select("referrer_id, amount");
      let referralRank: number | null = null;
      if (allReferrers) {
        const refMap = new Map<string, number>();
        for (const r of allReferrers) {
          refMap.set(r.referrer_id, (refMap.get(r.referrer_id) || 0) + Number(r.amount));
        }
        const sorted = [...refMap.entries()].sort((a, b) => b[1] - a[1]);
        const idx = sorted.findIndex(([uid]) => uid === profileUserId);
        referralRank = idx >= 0 ? idx + 1 : null;
      }

      // Quick Trade profit rank
      const { data: qtLeaderboard } = await supabase.rpc("get_quick_trade_leaderboard", { _limit: 500 });
      let qtProfitRank: number | null = null;
      if (qtLeaderboard && Array.isArray(qtLeaderboard)) {
        const idx = qtLeaderboard.findIndex((r: any) => r.user_id === profileUserId);
        qtProfitRank = idx >= 0 ? idx + 1 : null;
      }

      // Streak rank
      const { data: streakLeaderboard } = await supabase.rpc("get_streak_leaderboard", { _limit: 500 });
      let streakRank: number | null = null;
      if (streakLeaderboard && Array.isArray(streakLeaderboard)) {
        const idx = streakLeaderboard.findIndex((r: any) => r.user_id === profileUserId);
        streakRank = idx >= 0 ? idx + 1 : null;
      }

      return { predictionRank, referralRank, qtProfitRank, streakRank };
    },
    enabled: !!profileUserId,
    staleTime: 60_000,
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
  const verificationLevel = ((profile as any)?.verification_level || "none") as VerificationLevel;
  const isVerified = verificationLevel !== "none";
  const displayName = profile?.display_name || "Anonymous";

  if (profileLoading || authLoading || profileFetching) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-4xl mx-auto px-4 flex flex-col items-center justify-center" style={{ minHeight: "60vh", paddingTop: 'calc(1.5rem + var(--content-top))' }}>
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
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-4xl mx-auto px-4" style={{ paddingTop: 'calc(1.5rem + var(--content-top))' }}>
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
                onClick={handleFollowClick}
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
    <div
      ref={containerRef}
      className="h-dvh bg-background overflow-y-auto overscroll-contain"
      style={{ paddingBottom: 'calc(1rem + var(--content-bottom))', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', willChange: 'scroll-position' } as React.CSSProperties}
      onTouchStart={pullHandlers.onTouchStart}
      onTouchMove={pullHandlers.onTouchMove}
      onTouchEnd={pullHandlers.onTouchEnd}
    >
      <TopBar />

      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} pullDistance={pullDistance} pullProgress={pullProgress} spinControls={spinControls} />

      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(1.5rem + var(--content-top))' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => isOwnProfile ? navigate("/profile") : navigate(-1)} className="w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold truncate flex-1">{displayName}</h2>
          {!isOwnProfile && user && (
            <button
              onClick={() => navigate(`/messages/${profileUserId}`)}
              className="w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors"
              aria-label="Send message"
            >
              <MessageCircle className="w-4.5 h-4.5" />
            </button>
          )}
          <button
            onClick={() => setShareOpen(true)}
            className="w-9 h-9 rounded-full glass flex items-center justify-center hover:bg-muted transition-colors"
          >
            <Share2 className="w-4.5 h-4.5" />
          </button>
        </div>

        <ProfileShareCard
          ref={profileCardRef}
          displayName={displayName}
          bio={profile.bio}
          avatarUrl={profile.avatar_url}
          verificationLevel={verificationLevel}
          followersCount={followCounts.followers}
          followingCount={followCounts.following}
          tradesCount={tradeData.total}
          predictionsCount={tradeData.predictions}
          quickTradesCount={tradeData.quick_trades}
          referralCount={referralCount}
          marketsCount={userMarkets.length}
          positionsCount={userPositions.length}
          leaderboardRanks={leaderboardRanks}
        />

        <ShareModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          title={`${displayName} on OPoll`}
          description={`Join me on OPoll — the social prediction platform. Predict and earn! 🔥`}
          marketUrl={`${getCanonicalOrigin()}/user/${(profile as any)?.username || profileUserId}${profile?.display_name ? `?ref=${encodeURIComponent(profile.display_name)}` : ""}`}
          captureRef={profileCardRef}
        />

        {/* Profile Card */}
        <div className="glass rounded-2xl p-5 mb-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-primary">{getAvatarInitials(displayName, { maxChars: 2 })}</span>
                )}
              </div>
              {isVerified && (
                <span className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-card">
                  <Hexagon className="w-4 h-4 text-primary fill-primary/20" />
                </span>
              )}
              {isVerified && (
                <div className="absolute -top-1 -left-1 px-1.5 py-0.5 rounded-full bg-primary/20 border border-primary/30">
                  <span className="text-[8px] font-bold text-primary uppercase">Creator</span>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold truncate">{displayName}</h3>
                {isVerified && <NftBadge size={18} className="shrink-0" level={verificationLevel} />}
              </div>
              {(profile as any)?.username && (
                <p className="text-xs text-muted-foreground font-medium mb-1">@{(profile as any).username}</p>
              )}
              {profile.bio && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{profile.bio}</p>}
              {(profile as any).twitter_username && (
                <a
                  href={`https://x.com/${(profile as any).twitter_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-foreground/10 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  @{(profile as any).twitter_username}
                  <ShieldCheck className="w-3 h-3 text-primary" />
                </a>
              )}

              {/* Stats Row */}
              <div className="flex items-center gap-4 text-xs">
              <div className="text-center cursor-pointer hover:opacity-80" onClick={() => navigate(`/followers/${id}?tab=followers`)}>
                  <p className="font-bold">{followCounts.followers}</p>
                  <p className="text-muted-foreground text-[10px]">Followers</p>
                </div>
                <div className="text-center cursor-pointer hover:opacity-80" onClick={() => navigate(`/followers/${id}?tab=following`)}>
                  <p className="font-bold">{followCounts.following}</p>
                  <p className="text-muted-foreground text-[10px]">Following</p>
                </div>
                <div className="text-center">
                  <p className="font-bold">{tradeData.total}</p>
                  <p className="text-muted-foreground text-[10px]">Trades</p>
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
                onClick={handleFollowClick}
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
              {isFollowing && copyTradingEnabled && (
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

          {/* Mutual Followers */}
          {!isOwnProfile && <MutualFollowers targetUserId={id!} />}
        </div>

        {/* Copy Trading Settings */}
        <AnimatePresence>
          {showCopySettings && isFollowing && !isOwnProfile && copyTradingEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Copy className="w-4 h-4 text-primary" /> Copy Trading Settings
                  </h4>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    copySettings?.auto_copy
                      ? "bg-primary/15 text-primary border-primary/20"
                      : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {copySettings?.auto_copy ? (
                      <><Zap className="w-3 h-3" /> Auto</>
                    ) : (
                      <><ShieldCheck className="w-3 h-3" /> Manual</>
                    )}
                  </span>
                </div>
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
                    <p className="text-[10px] text-muted-foreground">
                      {copySettings?.auto_copy
                        ? "Trades copy instantly — you'll be notified after"
                        : "You'll approve each trade before it executes"}
                    </p>
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

        {/* Social Section (collapsible) */}
        {(isOwnProfile || profile?.is_public) && profile?.id && (
          <SocialSection userId={profile.id} isOwnProfile={isOwnProfile} isPublic={!!profile?.is_public} initialTab={searchParams.get("tab") === "spaces" ? "spaces" : undefined} />
        )}

        {/* Content Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-4">
          {(["markets", "predictions", "rank"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                activeTab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "markets" ? `Markets (${userMarkets.length})` : t === "predictions" ? "Predictions" : "Rank"}
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
                  {/* Price badges */}
                  <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                    {(market.market_type === "multi" || market.market_type === "range") ? (
                      <span className="px-1.5 py-0.5 rounded bg-primary/80 text-primary-foreground text-[8px] font-bold">
                        Multi
                      </span>
                    ) : (
                      <>
                        <span className="px-1.5 py-0.5 rounded bg-primary/80 text-primary-foreground text-[8px] font-bold">
                          Y {(market.yes_price * 100).toFixed(0)}¢
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-destructive/80 text-white text-[8px] font-bold">
                          N {(market.no_price * 100).toFixed(0)}¢
                        </span>
                      </>
                    )}
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
                const optLabel = pos.market_options?.label || null;
                const optPrice = pos.market_options?.price;
                const isMulti = market.market_type === "multi" || market.market_type === "range";
                const currentPrice = optPrice != null ? Number(optPrice) : (pos.side === "yes" ? market.yes_price : market.no_price);
                const pnl = pos.shares * (currentPrice - pos.avg_price);
                const displayLabel = isMulti && optLabel ? optLabel : pos.side.toUpperCase();
                return (
                  <div
                    key={pos.id}
                    onClick={() => navigate(`/market/${pos.market_id}`)}
                    className="glass rounded-xl p-3.5 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isMulti ? "bg-primary/10 text-primary" : pos.side === "yes" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                    }`}>
                      {pos.side === "yes" || isMulti ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{market.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {pos.shares.toFixed(1)} shares @ {(pos.avg_price * 100).toFixed(0)}¢ · {displayLabel}
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

        {/* Rank Tab */}
        {activeTab === "rank" && (
          <div className="glass rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="text-sm font-bold">Leaderboard Rankings</h4>
                <p className="text-[10px] text-muted-foreground">Position across all leaderboards</p>
              </div>
            </div>
            {ranksLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { icon: <TrendingUp className="w-4 h-4 text-emerald-500" />, label: "Prediction PnL", rank: leaderboardRanks?.predictionRank, link: "/rankings?tab=traders" },
                  { icon: <Gift className="w-4 h-4 text-amber-500" />, label: "Referrals", rank: leaderboardRanks?.referralRank, link: "/rankings?tab=referrers" },
                  { icon: <Zap className="w-4 h-4 text-blue-500" />, label: "Quick Trade Profit", rank: leaderboardRanks?.qtProfitRank, link: "/rankings?tab=quick&sub=profit" },
                  { icon: <Flame className="w-4 h-4 text-orange-500" />, label: "Win Streak", rank: leaderboardRanks?.streakRank, link: "/rankings?tab=quick&sub=streaks" },
                ].map((item) => (
                  <div
                    key={item.label}
                    onClick={() => navigate(item.link)}
                    className="flex items-center justify-between rounded-xl bg-muted/30 border border-border/20 p-3 cursor-pointer hover:bg-muted/50 active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      {item.icon}
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.rank ? (
                        <div className="flex items-center gap-1.5">
                          {item.rank <= 3 ? (
                            item.rank === 1 ? <Crown className="w-4 h-4" style={{ color: "hsl(45, 93%, 58%)" }} /> :
                            item.rank === 2 ? <Medal className="w-4 h-4" style={{ color: "hsl(0, 0%, 78%)" }} /> :
                            <Award className="w-4 h-4" style={{ color: "hsl(30, 75%, 40%)" }} />
                          ) : null}
                          <span className={`text-sm font-bold ${item.rank <= 3 ? "text-primary" : "text-foreground"}`}>#{item.rank}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unranked</span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <BottomNav />

      <AlertDialog open={showUnfollowConfirm} onOpenChange={setShowUnfollowConfirm}>
        <AlertDialogContent className="max-w-xs rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Unfollow {displayName}?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              You will stop receiving notifications about their activity and copy-trade settings will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUnfollow}
              className="rounded-xl text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserProfile;
