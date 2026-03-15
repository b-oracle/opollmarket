import { useRef, useEffect, useState, useCallback, ComponentType } from "react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Market } from "@/data/markets";
import { ActiveBoost } from "@/hooks/useActiveBoosts";
import BoostCountdown from "@/components/BoostCountdown";
import { toast } from "sonner";
import { getBoostTierConfig } from "@/lib/boostTiers";

const GAP = 16;
const AUTO_SCROLL_INTERVAL = 3500;

interface BoostedCarouselProps {
  markets: Market[];
  boostDetails: Map<string, ActiveBoost>;
  navigate: (path: string) => void;
  formatVolume: (v: number) => string;
  CategoryIcon: ComponentType<{ category: string; className?: string }>;
  onBoost: (market: Market) => void;
}

const hasAnyBoost = (markets: Market[], boostDetails: Map<string, ActiveBoost>) =>
  markets.some((m) => boostDetails.has(m.id));

const BoostedCarousel = ({
  markets,
  boostDetails,
  navigate,
  formatVolume,
  CategoryIcon,
  onBoost,
}: BoostedCarouselProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const cardWidth = container.offsetWidth;
    const scrollLeft = index * (cardWidth + GAP);
    container.scrollTo({ left: scrollLeft, behavior: "smooth" });
    setActiveIndex(index);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (markets.length <= 1 || isPaused) return;

    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % markets.length;
        scrollToIndex(next);
        return next;
      });
    }, AUTO_SCROLL_INTERVAL);

    return () => clearInterval(timerRef.current);
  }, [markets.length, isPaused, scrollToIndex]);

  // Pause on interaction
  const handleInteractionStart = () => setIsPaused(true);
  const handleInteractionEnd = () => {
    // Resume after 5s of no interaction
    setTimeout(() => setIsPaused(false), 5000);
  };

  // Sync activeIndex on manual scroll
  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const cardWidth = container.offsetWidth;
    const index = Math.round(container.scrollLeft / (cardWidth + GAP));
    setActiveIndex(index);
  };

  const showingBoosts = hasAnyBoost(markets, boostDetails);

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-primary" /> {showingBoosts ? "Boosted Markets" : "Trending Markets"}
      </h3>

      <div
        ref={scrollRef}
        onMouseEnter={handleInteractionStart}
        onMouseLeave={handleInteractionEnd}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide"
      >
        {markets.map((market) => {
          const boost = boostDetails.get(market.id);
          const isMulti = market.marketType !== "binary";
          const topOption =
            isMulti && market.options
              ? market.options.reduce((a, b) => (a.price > b.price ? a : b))
              : null;
          const displayPercent =
            isMulti && topOption
              ? Math.round(topOption.price * 100)
              : Math.round(market.yesPrice * 100);

          return (
            <motion.div
              key={market.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => navigate(`/market/${market.id}`)}
              className="snap-start shrink-0 w-full glass rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.97]"
              style={boost ? {
                boxShadow: getBoostTierConfig(boost.tier).glowShadow,
                border: `1px solid ${getBoostTierConfig(boost.tier).ringClass}`,
              } : {
                border: '1px solid hsl(var(--primary) / 0.2)',
              }}
            >
              {/* Image */}
              <div className="relative h-28 bg-secondary overflow-hidden">
                {market.imageUrl ? (
                  <img
                    src={market.imageUrl}
                    alt={market.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CategoryIcon category={market.category} className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                {boost ? (() => {
                  const tc = getBoostTierConfig(boost.tier);
                  const TierIcon = tc.icon;
                  return (
                    <div className="absolute top-2 left-2 flex items-center gap-1 glass rounded-full px-2 py-0.5">
                      <TierIcon className="w-3 h-3" style={{ color: tc.color }} />
                      <span className="text-[10px] font-bold" style={{ color: tc.color }}>{tc.label}</span>
                    </div>
                  );
                })() : (
                  <div className="absolute top-2 left-2 flex items-center gap-1 glass rounded-full px-2 py-0.5">
                    <Zap className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-bold text-primary">Trending</span>
                  </div>
                )}
                <div className="absolute top-2 right-2 glass rounded-full px-2 py-0.5">
                  <span className="text-[10px] font-bold neon-yes">
                    {displayPercent}% Chance
                  </span>
                </div>
                {boost && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-tl-lg rounded-br-2xl bg-primary/90 flex items-center justify-center animate-pulse shadow-[0_0_10px_hsl(var(--primary)/0.6)]">
                    <Zap className="w-3.5 h-3.5 text-primary-foreground" fill="currentColor" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-3 space-y-2">
                <h4 className="text-sm font-bold leading-snug line-clamp-2">
                  {market.title}
                </h4>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{market.category}</span>
                  <span>{formatVolume(market.volume)} Vol</span>
                </div>
                {boost && (
                  <BoostCountdown
                    endsAt={boost.ends_at}
                    tier={boost.tier}
                    compact
                  />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (market.status === "ended" || market.status === "resolved" || market.status === "cancelled") {
                      toast.info("This market has ended and is no longer available for boosting");
                      return;
                    }
                    onBoost(market);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold transition-all active:scale-95 hover:bg-primary/20"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {boost ? "Boost Again" : "Boost"}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Dot indicators */}
      {markets.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {markets.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className={`rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? "w-5 h-1.5 bg-primary"
                  : "w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BoostedCarousel;
