import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import watermarkLogo from "@/assets/watermark-logo.png";
import { optimizedImageUrl } from "@/lib/optimizedImage";
import blueLogo from "@/assets/blue-opoll-logo.png";
import { Heart, MessageCircle, Share2, TrendingUp, Users, Clock, BarChart3, Zap, Bookmark, ThumbsUp, ThumbsDown, ExternalLink, Flame, Radio, CheckCircle2, XCircle, Crown } from "lucide-react";
import { getBoostTierConfig } from "@/lib/boostTiers";
import { motion, AnimatePresence } from "framer-motion";
import { Market } from "@/data/markets";
import CategoryIcon from "@/components/CategoryIcon";
import { useNavigate } from "react-router-dom";
import BoostCountdown from "@/components/BoostCountdown";
import BetModal from "@/components/BetModal";
import CommentsDrawer from "@/components/CommentsDrawer";
import ShareModal from "@/components/ShareModal";
import { useCommentCount } from "@/hooks/useCommentCount";
import { useMarketLike } from "@/hooks/useMarketLike";
import { useBookmark } from "@/hooks/useBookmark";
import { useBookmarkCount } from "@/hooks/useBookmarkCount";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import LiveScoreBadge from "@/components/LiveScoreBadge";
import LivePriceBadge from "@/components/LivePriceBadge";
import YouTubeEmbed, { isStreamUrl } from "@/components/YouTubeEmbed";

interface MarketCardProps {
  market: Market;
  isActive: boolean;
  isBoosted?: boolean;
  boostEndsAt?: string;
  boostTier?: string;
  /** Pre-fetched comment count – when provided, skips the per-card query */
  batchCommentCount?: number;
  /** Pre-fetched like count – when provided, skips the per-card query */
  batchLikeCount?: number;
}

const truncateAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

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

const colorAlpha = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const MarketCard = ({ market, isActive, isBoosted = false, boostEndsAt, boostTier, batchCommentCount, batchLikeCount }: MarketCardProps) => {
  const navigate = useNavigate();
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const isMulti = market.marketType === "multi" || market.marketType === "range";
  const showBoosted = isBoosted || market.trending;
  const isEnded = market.status === "ended" || market.status === "resolved" || market.status === "cancelled" || new Date(market.endDate).getTime() < Date.now();

  // Real hooks for like, bookmark, comments
  const { user } = useAuth();
  const { data: creatorProfile } = useQuery({
    queryKey: ["creator-wallet", market.creatorAddress],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("wallet_address, avatar_url, verification_level, display_name")
        .eq("id", market.creatorAddress)
        .maybeSingle();
      return data;
    },
    enabled: !!market.creatorAddress,
    staleTime: 5 * 60 * 1000,
  });
  const creatorLabel = creatorProfile?.display_name
    ? `@${creatorProfile.display_name}`
    : `@${market.creatorName}`;
  const { liked, likeCount: individualLikeCount, toggleLike } = useMarketLike(market.id);
  const [likeDelta, setLikeDelta] = useState(0);
  const likeCount = (batchLikeCount !== undefined ? batchLikeCount : individualLikeCount) + likeDelta;

  const handleToggleLike = useCallback(async () => {
    const prev = liked;
    setLikeDelta(d => d + (prev ? -1 : 1));
    await toggleLike();
  }, [liked, toggleLike]);
  const { bookmarked, toggleBookmark } = useBookmark(market.id);
  const bookmarkCount = useBookmarkCount(market.id);
  const [betModal, setBetModal] = useState<{ open: boolean; side: "yes" | "no"; optionId?: string; optionLabel?: string; optionPrice?: number; optionColor?: string }>({ open: false, side: "yes" });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const individualCommentCount = useCommentCount(market.id);
  const commentCount = batchCommentCount !== undefined ? batchCommentCount : individualCommentCount;
  const [dragX, setDragX] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [swiping, setSwiping] = useState(false);
  const captureContentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchLockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const [parallaxY, setParallaxY] = useState(0);

  // Parallax effect for background image
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const scrollParent = card.closest('.snap-feed') || card.parentElement;
    if (!scrollParent) return;

    const handleScroll = () => {
      const rect = card.getBoundingClientRect();
      const parentRect = scrollParent.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const parentCenter = parentRect.top + parentRect.height / 2;
      const offset = (cardCenter - parentCenter) / parentRect.height;
      setParallaxY(offset * -30); // subtle 30px max shift
    };

    scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, []);

  const SWIPE_THRESHOLD = 60;
  const LOCK_ANGLE_THRESHOLD = 20; // pixels before locking direction

  // Manual touch handling for responsive swipe
  useEffect(() => {
    const el = cardRef.current;
    if (!el || isMulti) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      touchLockedRef.current = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      // Determine direction lock
      if (!touchLockedRef.current) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx > LOCK_ANGLE_THRESHOLD || absDy > LOCK_ANGLE_THRESHOLD) {
          touchLockedRef.current = absDx > absDy ? "horizontal" : "vertical";
        }
      }

      if (touchLockedRef.current === "horizontal") {
        e.preventDefault(); // prevent scroll
        setDragX(dx);
        if (!swiping && Math.abs(dx) > 10) setSwiping(true);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || touchLockedRef.current !== "horizontal") {
        setDragX(0);
        setSwiping(false);
        touchStartRef.current = null;
        touchLockedRef.current = null;
        return;
      }

      const dx = dragX;
      const elapsed = Date.now() - touchStartRef.current.time;
      const velocity = Math.abs(dx) / (elapsed || 1) * 1000; // px/s
      const triggered = Math.abs(dx) > SWIPE_THRESHOLD || (velocity > 400 && Math.abs(dx) > 25);

      if (triggered) {
        if (isEnded) {
          toast.info("This market has ended and is no longer available for predictions");
        } else {
          const side = dx > 0 ? "yes" : "no";
          setBetModal({ open: true, side });
        }
      }
      setDragX(0);
      setSwiping(false);
      touchStartRef.current = null;
      touchLockedRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMulti, swiping, dragX]);

  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const swipeSide = dragX > 0 ? "yes" : dragX < 0 ? "no" : null;

  const handleLike = () => {
    if (!user) {
      toast.error("Sign in to like markets", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    handleToggleLike();
  };

  const handleShare = async () => {
    // Preload market image into browser cache so html2canvas captures it
    const imgUrl = market.imageUrl;
    if (imgUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = imgUrl;
        setTimeout(resolve, 2000);
      });
    }
    setShareOpen(true);
  };

  const handleBookmark = () => {
    if (!user) {
      toast.error("Sign in to save to watchlist", {
        action: { label: "Sign In", onClick: () => window.location.href = "/auth" },
      });
      return;
    }
    toggleBookmark();
  };

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const actionIconSizeClass = "w-[clamp(2rem,4vh,2.75rem)] h-[clamp(2rem,4vh,2.75rem)]";
  const actionRailBottomClass = isMulti || isEnded ? "bottom-3" : "bottom-[5.8rem] sm:bottom-[6.2rem]";

  return (
    <>
      <div
        ref={cardRef}
        className={`snap-item relative w-full flex items-end px-3 sm:px-4 pb-2 overflow-hidden`}
        data-boost-ring="true"
        style={{ 
          height: 'var(--feed-card-height)',
          minHeight: 'var(--feed-card-height)',
          maxHeight: 'var(--feed-card-height)',
          touchAction: "pan-y",
          transform: dragX !== 0 ? `translateX(${dragX * 0.5}px)` : undefined,
          transition: dragX === 0 ? 'transform 0.25s ease-out' : 'none',
        }}
      >
        {/* Swipe overlay indicators */}
        {!isMulti && swiping && (
          <>
            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              style={{ opacity: swipeSide === "yes" ? swipeProgress * 0.8 : 0 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-primary/25" />
              <motion.div
                className="flex flex-col items-center gap-2"
                style={{ scale: 0.8 + swipeProgress * 0.4, opacity: swipeSide === "yes" ? swipeProgress : 0 }}
              >
                <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center backdrop-blur-sm">
                  <ThumbsUp className="w-10 h-10 text-primary" />
                </div>
                <span className="text-lg font-bold neon-yes">Buy Yes {yesPercent}¢</span>
              </motion.div>
            </motion.div>

            <motion.div
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              style={{ opacity: swipeSide === "no" ? swipeProgress * 0.8 : 0 }}
            >
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-destructive/10 to-destructive/25" />
              <motion.div
                className="flex flex-col items-center gap-2"
                style={{ scale: 0.8 + swipeProgress * 0.4, opacity: swipeSide === "no" ? swipeProgress : 0 }}
              >
                <div className="w-20 h-20 rounded-full bg-destructive/20 border-2 border-destructive flex items-center justify-center backdrop-blur-sm">
                  <ThumbsDown className="w-10 h-10 text-destructive" />
                </div>
                <span className="text-lg font-bold neon-no">Buy No {noPercent}¢</span>
              </motion.div>
            </motion.div>
          </>
        )}
        {/* Visible banner: always image + gradient */}
        <div className="absolute inset-0 overflow-hidden">
          {market.videoUrl && isStreamUrl(market.videoUrl) ? (
            <div className="absolute inset-0 overflow-hidden">
              <YouTubeEmbed url={market.videoUrl} fallbackImage={market.imageUrl ? optimizedImageUrl(market.imageUrl, "feed") : undefined} fallbackAlt={market.title} className="w-full h-full" fillContainer />
            </div>
          ) : market.imageUrl ? (
            <div className="absolute inset-[-4px_0] will-change-transform" style={{ transform: `translateY(${parallaxY}px)` }}>
              <img src={optimizedImageUrl(market.imageUrl, "feed")} alt="" className="w-full h-full object-cover object-top opacity-70" loading="lazy" />
            </div>
          ) : null}
          {/* Bottom-heavy gradient for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-background from-3% via-background/40 via-30% to-transparent pointer-events-none" />
          {isBoosted && boostTier && (
            <div className="absolute inset-0" style={{
              background: `linear-gradient(to bottom right, ${getBoostTierConfig(boostTier).ringClass}, transparent 60%)`,
            }} />
          )}
          {isEnded && (
            <div className="absolute inset-0 bg-background/40 z-10" />
          )}
        </div>

        {/* Ended badge */}
        {isEnded && (
          <div className="absolute top-3 right-3 z-20">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/90 text-destructive-foreground text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              <Clock className="w-3 h-3" />
              Ended
            </span>
          </div>
        )}

        {/* LIVE streaming badge */}
        {!isEnded && market.isStreaming && (
          <div className="absolute top-3 left-3 z-20">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/90 text-destructive-foreground text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              <Radio className="w-3 h-3" />
              LIVE
            </span>
          </div>
        )}

        {/* Chance badge removed from here — now inline with title */}

        {/* Hidden capture div for share screenshot */}
        <div ref={captureContentRef} className="absolute -left-[9999px] w-[600px] overflow-hidden rounded-xl" style={{ height: '400px', backgroundColor: '#0a0a0a' }}>
          {market.imageUrl && (
            <div className="absolute inset-0">
              <img src={market.imageUrl} alt="" className="w-full h-full object-cover" loading="eager" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.2) 40%, transparent 100%)' }} />
            </div>
          )}
          {isBoosted && boostTier && (
            <div className="absolute inset-0" style={{
              background: `linear-gradient(to bottom right, ${getBoostTierConfig(boostTier).ringClass}, transparent 60%)`,
            }} />
          )}

          {/* Probability ring or multi-option indicator */}
          <div className="absolute top-6 right-6 z-10">
            {isMulti ? (
              <div className="rounded-xl px-4 py-3 flex flex-col items-center gap-1" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <BarChart3 className="w-6 h-6" style={{ color: '#22c55e' }} />
                <span className="text-xs font-bold uppercase" style={{ color: '#22c55e' }}>
                  {market.options?.length} options
                </span>
              </div>
            ) : (
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#27272a" strokeWidth="4" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray={`${yesPercent * 2.136} ${213.6 - yesPercent * 2.136}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold" style={{ color: '#22c55e' }}>{yesPercent}%</span>
                  <span className="text-[11px]" style={{ color: '#a1a1aa' }}>YES</span>
                </div>
              </div>
            )}
          </div>

          {/* Category badge */}
          <div className="absolute top-6 left-6 z-10 flex items-center gap-2">
            <span className="px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-1.5" style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.8)' }}>
              <CategoryIcon category={market.category} className="w-3.5 h-3.5" /> {market.category}
            </span>
            {isMulti && (
              <span className="px-3 py-2 rounded-full text-xs font-bold" style={{ background: 'rgba(0,0,0,0.5)', color: '#22c55e' }}>
                {market.marketType === "range" ? "📊 Range" : "🎯 Multi"}
              </span>
            )}
          </div>

          {/* Bottom text overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-8" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)' }}>
            {isMulti && market.options?.length ? (() => {
              const leading = market.options!.reduce((a, b) => b.price > a.price ? b : a);
              return <span className="inline-block px-3 py-1 rounded-full text-lg font-bold mb-2" style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: '#22c55e' }}>{Math.round(leading.price * 100)}% Chance · {leading.label}</span>;
            })() : (
              <span className="inline-block px-3 py-1 rounded-full text-lg font-bold mb-2" style={{ backgroundColor: 'rgba(0,0,0,0.4)', color: '#22c55e' }}>{yesPercent}% Chance</span>
            )}
            <h3 className="text-2xl font-bold text-white mb-2 leading-tight">{market.title}</h3>
            <div className="flex items-center justify-between">
              {isMulti && market.options ? (
                <div className="flex flex-wrap gap-2">
                  {market.options.slice(0, 4).map((opt, i) => (
                    <span key={opt.id} className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: optionColors[i % optionColors.length] + '99' }}>
                      {opt.label} {Math.round(opt.price * 100)}%
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex gap-3">
                  <span className="px-4 py-1.5 rounded-full text-sm font-bold text-white" style={{ backgroundColor: 'hsl(145, 80%, 42%, 0.85)' }}>Buy Yes {yesPercent}%</span>
                  <span className="px-4 py-1.5 rounded-full text-sm font-bold text-white" style={{ backgroundColor: 'hsl(0, 85%, 55%, 0.85)' }}>Buy No {noPercent}%</span>
                </div>
              )}
              <span className="text-[11px] font-mono shrink-0 ml-3 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <Clock className="w-3 h-3" /> {getTimeRemaining(market.endDate)} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          {/* Watermark */}
          <div className="absolute bottom-3 right-4 z-20 opacity-40">
            <img src={watermarkLogo} alt="" className="h-7 w-auto" />
          </div>
        </div>

        <div className={`absolute ${actionRailBottomClass} right-2 sm:right-4 lg:right-24 z-30 flex w-14 sm:w-16 flex-col items-center gap-3 pointer-events-auto`}>
          {isBoosted && (() => {
            const tc = getBoostTierConfig(boostTier);
            const TierIcon = tc.icon;
            return (
              <div className="flex flex-col items-center gap-0.5">
                <div className={`${actionIconSizeClass} rounded-full glass bg-background/70 border border-border shadow-md flex items-center justify-center animate-pulse`}
                  style={{ backgroundColor: `${tc.color.replace(')', ' / 0.2)')}` }}>
                  <TierIcon className="w-4.5 h-4.5" style={{ color: tc.color }} />
                </div>
                <span className="text-[9px] text-foreground/90 font-semibold leading-none">{tc.label.split(' ')[0]}</span>
              </div>
            );
          })()}
          <button onClick={handleLike} className="flex flex-col items-center gap-0.5 group">
            <div className={`${actionIconSizeClass} rounded-full glass bg-background/70 border border-border shadow-md flex items-center justify-center transition-colors ${liked ? 'bg-destructive/20' : 'group-hover:bg-destructive/20'}`}>
              <Heart className={`w-5 h-5 transition-colors ${liked ? 'text-destructive fill-destructive' : 'text-foreground group-hover:text-destructive'}`} />
            </div>
            <span className="text-[10px] font-semibold text-foreground/90 leading-none">{formatCount(likeCount)}</span>
          </button>
          <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-0.5 group">
            <div className={`${actionIconSizeClass} rounded-full glass bg-background/70 border border-border shadow-md flex items-center justify-center group-hover:bg-primary/20 transition-colors`}>
              <MessageCircle className="w-5 h-5 text-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[10px] font-semibold text-foreground/90 leading-none">{formatCount(commentCount)}</span>
          </button>
          <button onClick={handleBookmark} className="flex flex-col items-center gap-0.5 group">
            <motion.div
              className={`${actionIconSizeClass} rounded-full glass bg-background/70 border border-border shadow-md flex items-center justify-center transition-colors ${bookmarked ? 'bg-primary/20' : 'group-hover:bg-primary/20'}`}
              animate={bookmarked ? { scale: [1, 1.3, 1] } : { scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Bookmark className={`w-5 h-5 transition-colors ${bookmarked ? 'text-primary fill-primary' : 'text-foreground group-hover:text-primary'}`} />
            </motion.div>
            <span className="text-[10px] font-semibold text-foreground/90 leading-none">{bookmarkCount > 0 ? formatCount(bookmarkCount) : (bookmarked ? "Saved" : "Save")}</span>
          </button>
          <button onClick={() => navigate(`/market/${market.id}`)} className="flex flex-col items-center gap-0.5 group">
            <div className={`${actionIconSizeClass} rounded-full glass bg-background/70 border border-border shadow-md flex items-center justify-center group-hover:bg-primary/20 transition-colors`}>
              <ExternalLink className="w-5 h-5 text-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[10px] font-semibold text-foreground/90 leading-none">Details</span>
          </button>
          <button onClick={handleShare} className="flex flex-col items-center gap-0.5 group">
            <div className={`${actionIconSizeClass} rounded-full glass bg-background/70 border border-border shadow-md flex items-center justify-center group-hover:bg-primary/20 transition-colors`}>
              <Share2 className="w-5 h-5 text-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[10px] font-semibold text-foreground/90 leading-none">Share</span>
          </button>
        </div>

        {/* Content */}
        <div className="relative z-10 w-full overflow-visible">
          {/* Creator line + trending */}
          <div className="flex items-center gap-2 mb-1.5 pr-14 sm:pr-16 lg:pr-32">
            <div
              className={`flex items-center gap-2 min-w-0 ${market.creatorAddress ? 'cursor-pointer group/creator' : ''}`}
              onClick={(e) => {
                if (market.creatorAddress) {
                  e.stopPropagation();
                  navigate(`/user/${market.creatorAddress}`);
                }
              }}
            >
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 group-hover/creator:border-primary/60 transition-colors overflow-hidden">
                {creatorProfile?.avatar_url ? (
                  <img src={optimizedImageUrl(creatorProfile.avatar_url, "avatar-sm")} alt={market.creatorName} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-[10px] font-bold text-primary">{market.creatorName.charAt(0)}</span>
                )}
              </div>
              <span className="text-xs font-medium text-foreground/80 truncate group-hover/creator:underline">{creatorLabel}</span>
              {creatorProfile?.verification_level && creatorProfile.verification_level !== "none" && (
                <NftBadge level={creatorProfile.verification_level as VerificationLevel} size={14} />
              )}
            </div>
            {showBoosted && (() => {
              if (isBoosted) {
                const tc = getBoostTierConfig(boostTier);
                const TierIcon = tc.icon;
                return (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-0.5 shrink-0 animate-pulse"
                    style={{ backgroundColor: `${tc.color.replace(')', ' / 0.2)')}`, color: tc.color }}>
                    <TierIcon className="w-2.5 h-2.5" /> {tc.label}
                  </span>
                );
              }
              return (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-0.5 shrink-0 bg-primary/10 text-primary">
                  <Zap className="w-2.5 h-2.5" /> Trending
                </span>
              );
            })()}
          </div>

          {/* Live badges line — scrollable */}
          {market.autoResolve && ((market.sportType && market.sportMatchId) || market.autoResolveAsset) && (
            <div className="flex items-center gap-1.5 mb-2 pr-14 sm:pr-16 lg:pr-32 overflow-x-auto scrollbar-hide">
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-0.5 bg-destructive/15 text-destructive border border-destructive/30 shrink-0">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> Live
              </span>
              {market.sportType && market.sportMatchId && (
                <div className="shrink-0"><LiveScoreBadge sportType={market.sportType} matchId={market.sportMatchId} /></div>
              )}
              {market.autoResolveAsset && !market.sportType && (
                <div className="shrink-0">
                  <LivePriceBadge
                    asset={market.autoResolveAsset}
                    targetPrice={market.autoResolveTargetPrice ?? undefined}
                    operator={market.autoResolveOperator ?? undefined}
                  />
                </div>
              )}
            </div>
          )}

          {isBoosted && boostEndsAt && user?.id === market.creatorAddress && (
            <div className="mb-2 pr-14 sm:pr-16 lg:pr-32">
              <BoostCountdown endsAt={boostEndsAt} tier={boostTier} />
            </div>
          )}

          <h2
            className="text-base sm:text-xl lg:text-2xl font-extrabold leading-snug sm:leading-snug mb-2 sm:mb-3 pr-14 sm:pr-16 lg:pr-32 cursor-pointer hover:text-primary transition-colors"
            onClick={() => navigate(`/market/${market.id}`)}
          >
            {market.title}{" "}
            {isMulti && market.options?.length ? (() => {
              const leading = market.options!.reduce((a, b) => b.price > a.price ? b : a);
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/15 text-xs font-bold neon-yes whitespace-nowrap align-middle">
                  {Math.round(leading.price * 100)}% Chance
                </span>
              );
            })() : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/15 text-xs font-bold neon-yes whitespace-nowrap align-middle">
                {yesPercent}% Chance
              </span>
            )}
          </h2>

          <p className="text-[11px] sm:text-sm lg:text-base text-muted-foreground font-medium mb-2 sm:mb-3 pr-14 sm:pr-16 lg:pr-32 line-clamp-2 leading-relaxed">{market.description}</p>

          <div className="flex items-center gap-3 mb-3 pr-14 sm:pr-16 lg:pr-32 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> {formatVolume(market.volume)} vol
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {market.participants.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {getTimeRemaining(market.endDate)}
            </span>
          </div>

          {/* Prediction buttons with action column */}
          <div className="relative pr-14 sm:pr-16 lg:pr-32">

            {/* Buttons */}
            {isEnded ? (
              <div className={`w-full text-center py-3 rounded-xl border flex items-center justify-center gap-2 ${
                market.status === "resolved"
                  ? "bg-primary/5 border-primary/20"
                  : market.status === "cancelled"
                    ? "bg-destructive/5 border-destructive/20"
                    : "bg-muted/50 border-border/50"
              }`}>
                {market.status === "resolved" ? <CheckCircle2 className="w-4 h-4 text-primary" /> : market.status === "cancelled" ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-muted-foreground" />}
                <span className={`text-sm font-semibold ${
                  market.status === "resolved" ? "text-primary" : market.status === "cancelled" ? "text-destructive" : "text-muted-foreground"
                }`}>{market.status === "resolved" ? "Market Ended — Resolution Completed" : market.status === "cancelled" ? "Market Cancelled" : "Market Ended — Awaiting Resolution"}</span>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
              >
                {isMulti && market.options ? (
                  <div className="space-y-2">
                    {market.options.slice(0, 4).map((opt, i) => {
                      const pct = Math.round(opt.price * 100);
                      const color = optionColors[i % optionColors.length];
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setBetModal({ open: true, side: "yes", optionId: opt.id, optionLabel: opt.label, optionPrice: pct, optionColor: color })}
                          className="w-full relative rounded-xl px-4 py-3 flex items-center justify-between transition-all active:scale-[0.98] overflow-hidden"
                          style={{
                            background: colorAlpha(color, 0.1),
                          }}
                        >
                          <div
                            className="absolute inset-0 rounded-xl"
                            style={{
                              background: `linear-gradient(90deg, ${colorAlpha(color, 0.12)} 0%, ${colorAlpha(color, 0.04)} ${pct}%, transparent ${pct}%)`,
                            }}
                          />
                          <div className="flex items-center gap-2.5 relative z-10">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color, boxShadow: `0 0 6px ${colorAlpha(color, 0.5)}` }}
                            />
                            <span className="text-sm font-semibold">{opt.label}</span>
                          </div>
                          <div className="flex items-center gap-2 relative z-10">
                            <span className="text-sm font-bold" style={{ color }}>
                              {pct}¢
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    {market.options.length > 4 && (
                      <button
                        onClick={() => navigate(`/market/${market.id}`)}
                        className="w-full text-center text-xs text-primary font-semibold py-1"
                      >
                        +{market.options.length - 4} more options →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex gap-3">
                      <button
                        onClick={() => setBetModal({ open: true, side: "yes" })}
                        className="flex-1 btn-yes py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95"
                      >
                        Buy Yes {yesPercent}¢
                      </button>
                      <button
                        onClick={() => setBetModal({ open: true, side: "no" })}
                        className="flex-1 btn-no py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95"
                      >
                        Buy No {noPercent}¢
                      </button>
                    </div>
                    {isActive && (
                      <motion.p
                        className="text-[10px] text-muted-foreground/50 font-medium text-center lg:hidden"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.2, duration: 0.5, ease: "easeOut" }}
                      >
                        ← Swipe left for NO · Swipe right for YES →
                      </motion.p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>


        </div>
      </div>


      <BetModal
        open={betModal.open}
        onClose={() => setBetModal({ open: false, side: "yes" })}
        side={betModal.side}
        price={betModal.optionPrice ?? (betModal.side === "yes" ? yesPercent : noPercent)}
        marketTitle={betModal.optionLabel ? `${market.title} — ${betModal.optionLabel}` : market.title}
        marketId={market.id}
        optionId={betModal.optionId}
        optionLabel={betModal.optionLabel}
        optionColor={betModal.optionColor}
        marketType={market.marketType}
      />

      <CommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        marketId={market.id}
        marketTitle={market.title}
      />
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={market.title}
        description={market.description}
        marketId={market.id}
        marketUrl={`${window.location.origin}/market/${market.id}`}
        captureRef={captureContentRef}
      />
    </>
  );
};

export default MarketCard;
