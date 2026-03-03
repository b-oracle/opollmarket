import { useState, useCallback, useRef } from "react";
import { Heart, MessageCircle, Share2, TrendingUp, Users, Clock, BarChart3, Zap, Bookmark, ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Market, categoryIcons } from "@/data/markets";
import { useNavigate } from "react-router-dom";
import BoostCountdown from "@/components/BoostCountdown";
import BetModal from "@/components/BetModal";
import CommentsDrawer from "@/components/CommentsDrawer";
import ShareModal from "@/components/ShareModal";
import { useCommentCount } from "@/hooks/useCommentCount";
import { toast } from "sonner";

interface MarketCardProps {
  market: Market;
  isActive: boolean;
  isBoosted?: boolean;
  boostEndsAt?: string;
  boostTier?: string;
}

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const getTimeRemaining = (endDate: string) => {
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 365) return `${Math.floor(days / 365)}y left`;
  if (days > 30) return `${Math.floor(days / 30)}mo left`;
  if (days <= 0) return "Ended";
  return `${days}d left`;
};

const optionColors = [
  "#02C7FC",
  "#EF4444",
  "#EAB308",
  "#A855F7",
  "#F97316",
  "#9CA3AF",
];

const colorAlpha = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const MarketCard = ({ market, isActive, isBoosted = false, boostEndsAt, boostTier }: MarketCardProps) => {
  const navigate = useNavigate();
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const isMulti = market.marketType === "multi" || market.marketType === "range";
  const showBoosted = isBoosted || market.trending;

  // Interactive state
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(Math.floor(Math.random() * 5000) + 500);
  const [bookmarked, setBookmarked] = useState(false);
  const [betModal, setBetModal] = useState<{ open: boolean; side: "yes" | "no"; optionLabel?: string; optionPrice?: number; optionColor?: string }>({ open: false, side: "yes" });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const commentCount = useCommentCount(market.id);
  const [dragX, setDragX] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [swiping, setSwiping] = useState(false);
  const captureContentRef = useRef<HTMLDivElement>(null);

  const SWIPE_THRESHOLD = 80;

  const handleDrag = useCallback((_: any, info: { offset: { x: number } }) => {
    if (isMulti) return;
    setDragX(info.offset.x);
    if (!swiping && Math.abs(info.offset.x) > 10) setSwiping(true);
  }, [isMulti, swiping]);

  const handleDragEnd = useCallback((_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (isMulti) { setDragX(0); setSwiping(false); return; }
    const swipeDistance = info.offset.x;
    const velocity = Math.abs(info.velocity.x);
    const triggered = Math.abs(swipeDistance) > SWIPE_THRESHOLD || (velocity > 300 && Math.abs(swipeDistance) > 30);

    if (triggered) {
      const side = swipeDistance > 0 ? "yes" : "no";
      setBetModal({ open: true, side });
    }
    setDragX(0);
    setSwiping(false);
  }, [isMulti]);

  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const swipeSide = dragX > 0 ? "yes" : dragX < 0 ? "no" : null;

  const handleLike = () => {
    setLiked((prev) => !prev);
    setLikeCount((prev) => (liked ? prev - 1 : prev + 1));
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleBookmark = () => {
    setBookmarked((prev) => !prev);
    toast.success(bookmarked ? "Removed from watchlist" : "Added to watchlist");
  };

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <>
      <motion.div
        ref={cardRef}
        drag={isMulti ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.3}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        className={`snap-item relative h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] w-full flex items-end pb-6 px-3 sm:px-4 overflow-hidden ${isBoosted ? 'ring-1 ring-primary/30' : ''}`}
        style={{ touchAction: "pan-y" }}
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
                <span className="text-lg font-bold neon-yes">YES {yesPercent}¢</span>
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
                <span className="text-lg font-bold neon-no">NO {noPercent}¢</span>
              </motion.div>
            </motion.div>
          </>
        )}
        {/* Capturable content for share screenshot */}
        <div ref={captureContentRef} className="absolute inset-0">
          {/* Background image */}
          {market.imageUrl && (
            <div className="absolute inset-0">
              <img src={market.imageUrl} alt="" className="w-full h-full object-cover opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
            </div>
          )}

          <div className={`absolute inset-0 ${isBoosted ? 'bg-gradient-to-br from-primary/15 via-primary/5 to-transparent' : ''}`} />

          {/* Probability ring or multi-option indicator */}
          <div className="absolute top-8 right-4 z-10">
            {isMulti ? (
              <div className="glass rounded-xl px-3 py-2 flex flex-col items-center gap-1">
                <BarChart3 className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-bold text-primary uppercase">
                  {market.options?.length} options
                </span>
              </div>
            ) : (
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--neon-yes))" strokeWidth="4" strokeDasharray={`${yesPercent * 2.136} ${213.6 - yesPercent * 2.136}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold neon-yes">{yesPercent}%</span>
                  <span className="text-[10px] text-muted-foreground">YES</span>
                </div>
              </div>
            )}
          </div>

          {/* Category badge */}
          <div className="absolute top-8 left-4 z-10 flex items-center gap-2">
            <span className="glass px-3 py-1.5 rounded-full text-xs font-medium text-foreground/80">
              {categoryIcons[market.category]} {market.category}
            </span>
            {isMulti && (
              <span className="glass px-2 py-1.5 rounded-full text-[10px] font-bold text-primary">
                {market.marketType === "range" ? "📊 Range" : "🎯 Multi"}
              </span>
            )}
          </div>

          {/* Text overlay for share screenshot */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
            <h3 className="text-xl font-bold text-white mb-1 line-clamp-2">{market.title}</h3>
            <p className="text-sm text-white/70 line-clamp-2 mb-3">{market.description}</p>
            {isMulti && market.options ? (
              <div className="flex flex-wrap gap-2">
                {market.options.slice(0, 4).map((opt, i) => (
                  <span key={opt.id} className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: optionColors[i % optionColors.length] + '99' }}>
                    {opt.label} {Math.round(opt.price * 100)}%
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'hsl(145, 80%, 42%, 0.85)' }}>YES {yesPercent}%</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'hsl(0, 85%, 55%, 0.85)' }}>NO {noPercent}%</span>
              </div>
            )}
          </div>
        </div>




        {/* Side actions */}
        <div className="absolute right-4 bottom-40 z-10 flex flex-col items-center gap-4">
          <button onClick={handleLike} className="flex flex-col items-center gap-1 group">
            <div className={`w-10 h-10 rounded-full glass flex items-center justify-center transition-colors ${liked ? 'bg-destructive/20' : 'group-hover:bg-destructive/20'}`}>
              <Heart className={`w-5 h-5 transition-colors ${liked ? 'text-destructive fill-destructive' : 'text-foreground/70 group-hover:text-destructive'}`} />
            </div>
            <span className="text-[10px] text-muted-foreground">{formatCount(likeCount)}</span>
          </button>
          <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1 group">
            <div className="w-10 h-10 rounded-full glass flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <MessageCircle className="w-5 h-5 text-foreground/70 group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[10px] text-muted-foreground">{formatCount(commentCount)}</span>
          </button>
          <button onClick={() => navigate(`/market/${market.id}`)} className="flex flex-col items-center gap-1 group">
            <div className="w-10 h-10 rounded-full glass flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <ExternalLink className="w-5 h-5 text-foreground/70 group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[10px] text-muted-foreground">Details</span>
          </button>
          <button onClick={handleBookmark} className="flex flex-col items-center gap-1 group">
            <div className={`w-10 h-10 rounded-full glass flex items-center justify-center transition-colors ${bookmarked ? 'bg-primary/20' : 'group-hover:bg-primary/20'}`}>
              <Bookmark className={`w-5 h-5 transition-colors ${bookmarked ? 'text-primary fill-primary' : 'text-foreground/70 group-hover:text-primary'}`} />
            </div>
            <span className="text-[10px] text-muted-foreground">{bookmarked ? "Saved" : "Save"}</span>
          </button>
          <button onClick={handleShare} className="flex flex-col items-center gap-1 group">
            <div className="w-10 h-10 rounded-full glass flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Share2 className="w-5 h-5 text-foreground/70 group-hover:text-primary transition-colors" />
            </div>
            <span className="text-[10px] text-muted-foreground">Share</span>
          </button>
        </div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-[calc(100%-4rem)]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">{market.creatorName.charAt(0)}</span>
            </div>
            <span className="text-sm font-medium text-foreground/80">@{market.creatorName}</span>
            {showBoosted && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                isBoosted 
                  ? 'bg-primary/20 text-primary animate-pulse' 
                  : 'bg-primary/10 text-primary'
              }`}>
                <Zap className="w-3 h-3" /> {isBoosted ? 'Boosted 🔥' : 'Trending'}
              </span>
            )}
          </div>

          {isBoosted && boostEndsAt && (
            <div className="mb-2">
              <BoostCountdown endsAt={boostEndsAt} tier={boostTier} />
            </div>
          )}

          <h2
            className="text-lg sm:text-xl font-bold leading-tight mb-3 cursor-pointer hover:text-primary transition-colors"
            onClick={() => navigate(`/market/${market.id}`)}
          >
            {market.title}
          </h2>

          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{market.description}</p>

          <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> {formatVolume(market.volume)} vol
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {market.participants.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {getTimeRemaining(market.endDate)}
            </span>
          </div>

          {/* Prediction buttons */}
          {isActive && (
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
                        onClick={() => setBetModal({ open: true, side: "yes", optionLabel: opt.label, optionPrice: pct, optionColor: color })}
                        className="w-full relative rounded-xl px-4 py-3 flex items-center justify-between transition-all active:scale-[0.98] overflow-hidden"
                        style={{
                          background: colorAlpha(color, 0.1),
                        }}
                      >
                        {/* Fill bar showing probability */}
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
                <div className="flex gap-3">
                  <button
                    onClick={() => setBetModal({ open: true, side: "yes" })}
                    className="flex-1 btn-yes py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95"
                  >
                    YES {yesPercent}¢
                  </button>
                  <button
                    onClick={() => setBetModal({ open: true, side: "no" })}
                    className="flex-1 btn-no py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95"
                  >
                    NO {noPercent}¢
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {isActive && !isMulti && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-[10px] text-muted-foreground/50 text-center mt-3"
            >
              ← Swipe left for NO · Swipe right for YES →
            </motion.p>
          )}
        </div>
      </motion.div>

      <BetModal
        open={betModal.open}
        onClose={() => setBetModal({ open: false, side: "yes" })}
        side={betModal.side}
        price={betModal.optionPrice ?? (betModal.side === "yes" ? yesPercent : noPercent)}
        marketTitle={betModal.optionLabel ? `${market.title} — ${betModal.optionLabel}` : market.title}
        optionLabel={betModal.optionLabel}
        optionColor={betModal.optionColor}
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
        marketUrl={`${window.location.origin}/market/${market.id}`}
        captureRef={captureContentRef}
      />
    </>
  );
};

export default MarketCard;
