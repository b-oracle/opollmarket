import SEOHead from "@/components/SEOHead";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useSidebarState } from "@/hooks/useSidebarState";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { toast } from "sonner";
import MarketCard from "@/components/MarketCard";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useMarkets } from "@/hooks/useMarkets";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import { Loader2, TrendingUp, Users, Clock, Heart, MessageCircle, Zap, Flame, ExternalLink, Bookmark } from "lucide-react";
import { motion } from "framer-motion";
import useAnalytics from "@/hooks/useAnalytics";
import CategoryIcon from "@/components/CategoryIcon";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBookmarkedMarkets } from "@/hooks/useBookmarkedMarkets";
import { useAuth } from "@/hooks/useAuth";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import { supabase } from "@/integrations/supabase/client";
import { useBatchCounts } from "@/hooks/useBatchCounts";
import BoostCountdown from "@/components/BoostCountdown";
import YouTubeEmbed, { isStreamUrl } from "@/components/YouTubeEmbed";
import { hapticSelection } from "@/lib/haptics";

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
};


const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Number(v.toFixed(2))}`;
};

const getTimeRemaining = (endDate: string) => {
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (days > 365) return `${Math.floor(days / 365)}y left`;
  if (days > 30) return `${Math.floor(days / 30)}mo left`;
  if (days >= 1) return `${days}d left`;
  if (hours >= 1) return `${hours}h left`;
  return `< 1h left`;
};

import { optionColors } from "@/lib/optionColors";

const CommentBadge = ({ count }: { count: number }) => {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <MessageCircle className="w-3 h-3" />
      {count}
    </span>);
};

const LikeBadge = ({ count }: { count: number }) => {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <Heart className="w-3 h-3" />
      {count}
    </span>);
};

/* ── Desktop/Tablet Feed Card ── */
const DesktopFeedCard = ({ market, isBoosted, boostEndsAt, boostTier, commentCount = 0, likeCount = 0
}: {market: any;isBoosted: boolean;boostEndsAt?: string;boostTier?: string; commentCount?: number; likeCount?: number;}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const isMulti = market.marketType === "multi" || market.marketType === "range";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group glass rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl ${
      isBoosted ? "ring-1 ring-primary/30" : ""}`
      }
      onClick={() => navigate(`/market/${market.id}`)}>
      
      {/* Image */}
      <div className="relative h-44 lg:h-52 overflow-hidden">
        {market.videoUrl && isStreamUrl(market.videoUrl) ?
        <div className="absolute inset-0">
          <YouTubeEmbed url={market.videoUrl} fallbackImage={market.imageUrl || undefined} fallbackAlt={market.title} className="w-full h-full" />
        </div> :
        market.imageUrl ?
        <img
          src={market.imageUrl}
          alt={market.title}
          className="w-full h-full object-cover opacity-50 transition-transform duration-500 group-hover:scale-105"
          loading="lazy" /> :
        <div className="w-full h-full bg-gradient-to-br from-primary/20 via-muted to-accent flex items-center justify-center">
            <CategoryIcon category={market.category} className="w-12 h-12 text-muted-foreground/30" />
          </div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />

        {/* Category badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-background/70 backdrop-blur-sm text-[11px] font-medium text-foreground inline-flex items-center gap-1">
            <CategoryIcon category={market.category} className="w-3 h-3" />
            {market.category}
          </span>
          {isMulti &&
          <span className="px-2 py-1 rounded-full bg-primary/20 backdrop-blur-sm text-[10px] font-bold text-primary">
              {market.marketType === "range" ? "📊 Range" : "🎯 Multi"}
            </span>
          }
        </div>

        {/* Boosted / Trending badge */}
        {(isBoosted || market.trending) &&
        <div className="absolute top-3 right-3">
            <span className={`px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 backdrop-blur-sm ${
          isBoosted ? "bg-orange-500/20 text-orange-400" : "bg-primary/20 text-primary"}`
          }>
              {isBoosted ? <><Flame className="w-3 h-3" /> Boosted</> : <><Zap className="w-3 h-3" /> Trending</>}
            </span>
          </div>
        }

        {/* Chance overlay */}
        <div className="absolute bottom-3 left-3">
          {isMulti && market.options?.length ? (() => {
            const leading = market.options.reduce((a: any, b: any) => b.price > a.price ? b : a);
            return (
              <span className="px-2.5 py-1 rounded-full bg-background/70 backdrop-blur-sm text-xs font-bold neon-yes">
                {Math.round(leading.price * 100)}% · {leading.label}
              </span>);

          })() :
          <span className="px-2.5 py-1 rounded-full bg-background/70 backdrop-blur-sm text-xs font-bold neon-yes">
              {yesPercent}% Chance
            </span>
          }
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isBoosted && boostEndsAt && user?.id === market.creatorAddress &&
        <div className="mb-2">
            <BoostCountdown endsAt={boostEndsAt} tier={boostTier} />
          </div>
        }

        <h3 className="text-sm font-bold leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {market.title}
        </h3>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{market.description}</p>

        {/* Stats */}
        <div className="flex items-center gap-3 mb-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> {formatVolume(market.volume)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {market.participants.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {getTimeRemaining(market.endDate)}
          </span>
          <CommentBadge count={commentCount} />
          <LikeBadge count={likeCount} />
        </div>

        {/* Prediction buttons */}
        {isMulti && market.options ?
        <div className="space-y-1.5">
            {market.options.slice(0, 3).map((opt: any, i: number) => {
            const pct = Math.round(opt.price * 100);
            const color = optionColors[i % optionColors.length];
            return (
              <div
                key={opt.id}
                className="relative rounded-lg px-3 py-2 flex items-center justify-between overflow-hidden"
                style={{ background: `${color}10` }}>
                
                  <div
                  className="absolute inset-0 rounded-lg"
                  style={{ background: `linear-gradient(90deg, ${color}18 0%, transparent ${pct}%)` }} />
                
                  <div className="flex items-center gap-2 relative z-10">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </div>
                  <span className="text-xs font-bold relative z-10" style={{ color }}>{pct}¢</span>
                </div>);

          })}
            {market.options.length > 3 &&
          <p className="text-[10px] text-primary font-medium text-center">+{market.options.length - 3} more</p>
          }
          </div> :

        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
            onClick={(e) => {e.stopPropagation();navigate(`/market/${market.id}`);}}
            className="flex-1 btn-yes py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all active:scale-95">
            
              Yes {yesPercent}¢
            </button>
            <button
            onClick={(e) => {e.stopPropagation();navigate(`/market/${market.id}`);}}
            className="flex-1 btn-no py-2.5 rounded-xl font-bold text-xs tracking-wide transition-all active:scale-95">
            
              No {noPercent}¢
            </button>
          </div>
        }
      </div>
    </motion.div>);

};

const Feed = () => {
  const navigate = useNavigate();
  const [tabOpen, setTabOpen] = useState(false);
  const [watchlistPulse, setWatchlistPulse] = useState(false);
  const prevBookmarkCount = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: markets = [], isLoading, refetch } = useMarkets();
  const { boostedMarketIds, boostDetails } = useActiveBoosts();
  const { track } = useAnalytics();
  const isDesktop = useIsDesktop();
  const isMobile = useIsMobile();
  const { collapsed } = useSidebarState();
  const sidebarLeft = !isDesktop ? 0 : collapsed ? '4.5rem' : '15rem';
  const { bookmarkedIds } = useBookmarkedMarkets();
  const { user, loading: authLoading } = useAuth();
  const [feedTab, setFeedTab] = useState<"foryou" | "bookmarks">("foryou");
  const [visibleCount, setVisibleCount] = useState(20);
  const { joinSpace } = useActiveSpace();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [searchParams] = useSearchParams();

  useEffect(() => {track("page_view", { page: "feed" });}, []);

  // Handle ?space= deep link — redirect to auth if not logged in, otherwise open space
  useEffect(() => {
    const spaceId = searchParams.get("space");
    if (!spaceId) return;

    // CRITICAL: Wait for auth to finish loading before deciding whether to redirect.
    // Without this check, user is null during initial load and the effect
    // incorrectly redirects logged-in users to /auth, causing logout and misbehavior.
    if (authLoading) return;

    const ref = searchParams.get("ref");

    if (!user) {
      // Redirect to auth with referral code and return URL
      const params = new URLSearchParams();
      if (ref) params.set("ref", ref);
      params.set("redirect", `/feed?space=${spaceId}`);
      navigate(`/auth?${params.toString()}`, { replace: true });
      return;
    }

    // User is logged in — handle space deep link
    (async () => {
      const { data: space } = await supabase
        .from("spaces")
        .select("id, title, host_id, status")
        .eq("id", spaceId)
        .maybeSingle();
      if (!space) {
        navigate("/feed", { replace: true });
        toast("This space is no longer available", { duration: 3000 });
        return;
      }

      if (space.status === "live") {
        navigate("/feed", { replace: true });
        joinSpace({ id: space.id, title: space.title, hostId: space.host_id });
      } else if (space.status === "scheduled") {
        // Auto-set reminder for the user
        try {
          await supabase.from("space_reminders" as any).upsert(
            { space_id: space.id, user_id: user.id },
            { onConflict: "space_id,user_id" }
          );
        } catch {
          // ignore duplicate
        }
        navigate(`/user/${user.id}?tab=spaces`, { replace: true });
        toast("🔔 This Space isn't live yet! We've set a reminder for you — you'll be notified when it starts.", { duration: 5000 });
      } else if (space.status === "ended") {
        navigate(`/user/${user.id}?tab=spaces`, { replace: true });
        toast("This Space has ended", { duration: 3000 });
      } else {
        navigate("/feed", { replace: true });
        toast("This space is no longer available", { duration: 3000 });
      }
    })();
  }, [searchParams, user, authLoading, navigate, joinSpace]);

  // Pulse when bookmarks increase
  useEffect(() => {
    const prev = prevBookmarkCount.current;
    if (prev !== null && bookmarkedIds.size > prev) {
      setWatchlistPulse(true);
      const t = setTimeout(() => setWatchlistPulse(false), 2000);
      prevBookmarkCount.current = bookmarkedIds.size;
      return () => clearTimeout(t);
    }
    prevBookmarkCount.current = bookmarkedIds.size;
  }, [bookmarkedIds.size]);

  // Reset to first card and visible count when switching tabs
  useEffect(() => {
    setActiveIndex(0);
    setVisibleCount(20);
    containerRef.current?.scrollTo({ top: 0 });
  }, [feedTab]);

  const { pulling, pullDistance, refreshing, pullProgress, spinControls, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: async () => { await refetch(); },
    scrollRef: containerRef,
  });

  const allSortedMarkets = useMemo(() => {
    const base = [...markets].sort((a, b) => {
      const aBoost = boostedMarketIds.has(a.id) ? 2 : a.trending ? 1 : 0;
      const bBoost = boostedMarketIds.has(b.id) ? 2 : b.trending ? 1 : 0;
      return bBoost - aBoost;
    });
    if (feedTab === "bookmarks") return base.filter((m) => bookmarkedIds.has(m.id));
    return base;
  }, [markets, boostedMarketIds, feedTab, bookmarkedIds]);

  const sortedMarkets = useMemo(() => allSortedMarkets.slice(0, visibleCount), [allSortedMarkets, visibleCount]);
  const hasMore = visibleCount < allSortedMarkets.length;

  // Batch fetch comment + like counts for visible markets (2 queries instead of 2×N)
  const visibleMarketIds = useMemo(() => sortedMarkets.map(m => m.id), [sortedMarkets]);
  const { data: batchCounts } = useBatchCounts(visibleMarketIds);

  const endToastShown = useRef(false);

  useEffect(() => {
    if (isDesktop) return;
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const itemHeight = container.clientHeight;
      const index = Math.round(container.scrollTop / itemHeight);
      setActiveIndex(index);

      const snappedTop = index * itemHeight;
      const offset = Math.abs(container.scrollTop - snappedTop);

      // Load more when approaching the end
      if (index >= sortedMarkets.length - 5 && hasMore) {
        setVisibleCount((c) => c + 20);
      }

      const isAtEnd = container.scrollTop >= (container.scrollHeight - container.clientHeight) - 5;
      const isOnLastCard = index >= sortedMarkets.length - 1;

      if (isAtEnd && isOnLastCard && sortedMarkets.length > 0 && !hasMore && !endToastShown.current) {
        endToastShown.current = true;
        toast("Nothing more to see 👀", { duration: 2000, position: "top-center" });
        setTimeout(() => {
          container.scrollTo({ top: (sortedMarkets.length - 1) * itemHeight, behavior: "smooth" });
        }, 300);
      }

      if (!isAtEnd) endToastShown.current = false;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [sortedMarkets.length, isDesktop, hasMore]);

  // IntersectionObserver for desktop grid infinite scroll
  useEffect(() => {
    if (!isDesktop) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((c) => c + 20);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isDesktop, hasMore]);

  if (isLoading) {
    return (
      <div className="h-dvh flex flex-col bg-background">
        <TopBar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-lg space-y-4 animate-pulse">
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="h-5 bg-muted/60 rounded-lg w-3/4" />
              <div className="h-3 bg-muted/40 rounded-lg w-full" />
              <div className="h-3 bg-muted/40 rounded-lg w-2/3" />
              <div className="h-48 bg-muted/30 rounded-xl" />
              <div className="flex gap-3">
                <div className="flex-1 h-12 bg-muted/50 rounded-xl" />
                <div className="flex-1 h-12 bg-muted/50 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
        <BottomNav />
      </div>);

  }

  

  return (
    <div className="h-dvh flex flex-col bg-background relative" style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}>
      <SEOHead title="Feed" description="Swipe through prediction markets like TikTok. Vote YES or NO on real-world events." path="/feed" />
      <TopBar />

      {/* Feed tabs - slide-in from right */}
      <div
        className="fixed right-0 z-30 flex items-center pointer-events-auto"
        style={{ top: 'calc(3.5rem + var(--safe-top) + 10px)' }}>
        
        <motion.div
          className="flex items-center"
          animate={{ x: tabOpen ? 0 : 'calc(100% - 28px)' }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}>
          
          {/* Tab handle */}
          <button
            onClick={() => setTabOpen(!tabOpen)}
            className={`w-7 h-9 rounded-l-lg bg-background/80 backdrop-blur-md border border-r-0 border-border/40 flex items-center justify-center shadow-md shrink-0 transition-shadow duration-300 ${
              watchlistPulse ? "shadow-primary/50 shadow-[0_0_12px_hsl(var(--primary)/0.5)]" : ""
            }`}>
            
            <motion.div
              animate={watchlistPulse ? { scale: [1, 1.3, 1], rotate: tabOpen ? 180 : 0 } : { rotate: tabOpen ? 180 : 0 }}
              transition={watchlistPulse ? { scale: { repeat: 3, duration: 0.6 }, duration: 0.2 } : { duration: 0.2 }}>
              
              <Bookmark className={`w-3.5 h-3.5 transition-colors ${watchlistPulse ? "text-primary fill-primary/30" : "text-primary"}`} />
            </motion.div>
          </button>
          {/* Tab pill */}
          <div className="relative flex rounded-l-xl bg-background/80 backdrop-blur-md border border-r-0 border-border/40 p-0.5 shadow-md">
            <motion.div
              className="absolute top-0.5 bottom-0.5 rounded-l-lg rounded-r-lg bg-primary"
              layout
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              style={{
                width: "calc(50% - 2px)",
                left: feedTab === "foryou" ? 2 : "calc(50%)"
              }}
            />
            <button
              onClick={() => { setFeedTab("foryou"); setTimeout(() => setTabOpen(false), 300); }}
              className={`relative z-10 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                feedTab === "foryou" ? "text-primary-foreground" : "text-muted-foreground"
              }`}>
              For You
            </button>
            <button
              onClick={() => {
                if (!user) {
                  toast.error("Sign in to view your watchlist", {
                    action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
                  });
                  return;
                }
                setFeedTab("bookmarks");
                setTimeout(() => setTabOpen(false), 300);
              }}
              className={`relative z-10 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 ${
                feedTab === "bookmarks" ? "text-primary-foreground" : "text-muted-foreground"
              }`}>
              Watchlist
            </button>
          </div>
        </motion.div>
      </div>

      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} pullDistance={pullDistance} pullProgress={pullProgress} spinControls={spinControls} />

      {/* Empty bookmarks state */}
      {feedTab === "bookmarks" && allSortedMarkets.length === 0 ?
      <div className="flex-1 flex items-center justify-center px-4" style={{ marginTop: 'var(--content-top)', marginLeft: !isDesktop ? undefined : (collapsed ? '4.5rem' : '15rem'), transition: 'margin-left 0.3s ease' }}>
          <div className="text-center space-y-3">
            <Bookmark className="w-12 h-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">Your watchlist is empty</p>
            <p className="text-xs text-muted-foreground/70">Tap the bookmark icon on any market to add it to your watchlist</p>
            <button
            onClick={() => setFeedTab("foryou")}
            className="mt-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
            
              Browse Markets
            </button>
          </div>
        </div> :

      <div
        ref={containerRef}
        className="snap-feed w-full"
        style={{ 
          position: 'fixed',
          top: 'var(--content-top)',
          bottom: isDesktop ? 0 : 'var(--content-bottom)',
          left: sidebarLeft,
          right: 0,
          transition: 'left 0.3s ease',
          ['--feed-card-height' as any]: isDesktop
            ? 'calc(100dvh - var(--content-top))'
            : 'calc(100dvh - var(--content-top) - var(--content-bottom))',
        }}
        onTouchStart={pullHandlers.onTouchStart}
        onTouchMove={pullHandlers.onTouchMove}
        onTouchEnd={pullHandlers.onTouchEnd}>
        
          {sortedMarkets.map((market, i) => {
          const boost = boostDetails.get(market.id);
          return (
            <MarketCard
              key={market.id}
              market={market}
              isActive={i === activeIndex}
              isBoosted={boostedMarketIds.has(market.id)}
              boostEndsAt={boost?.ends_at}
              boostTier={boost?.tier}
              batchCommentCount={batchCounts?.comments.get(market.id) || 0}
              batchLikeCount={batchCounts?.likes.get(market.id) || 0} />);


        })}
        </div>
      }
      <BottomNav />
    </div>);

};

export default Feed;