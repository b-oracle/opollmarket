import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { Market } from "@/data/markets";
import CategoryIcon from "@/components/CategoryIcon";
import { useNavigate } from "react-router-dom";

const GAP = 12;
const AUTO_SCROLL_INTERVAL = 4000;

interface CategoryCarouselProps {
  title: string;
  icon: React.ReactNode;
  markets: Market[];
  formatVolume: (v: number) => string;
  onViewAll?: () => void;
}

const CategoryCarousel = ({
  title,
  icon,
  markets,
  formatVolume,
  onViewAll,
}: CategoryCarouselProps) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const scrollToIndex = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container || !container.firstElementChild) return;
      const card = container.firstElementChild as HTMLElement;
      const cardWidth = card.offsetWidth;
      container.scrollTo({ left: index * (cardWidth + GAP), behavior: "smooth" });
      setActiveIndex(index);
    },
    []
  );

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

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container || !container.firstElementChild) return;
    const card = container.firstElementChild as HTMLElement;
    const cardWidth = card.offsetWidth;
    setActiveIndex(Math.round(container.scrollLeft / (cardWidth + GAP)));
  };

  if (markets.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          {icon} {title}
        </h3>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-primary font-semibold flex items-center gap-0.5 hover:underline"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setTimeout(() => setIsPaused(false), 5000)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setTimeout(() => setIsPaused(false), 5000)}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide"
      >
        {markets.map((market) => {
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
              className="snap-start shrink-0 w-[75%] sm:w-[60%] md:w-[45%] glass rounded-xl overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all active:scale-[0.97]"
            >
              <div className="relative h-24 bg-secondary overflow-hidden">
                {market.imageUrl ? (
                  <img
                    src={market.imageUrl}
                    alt={market.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CategoryIcon
                      category={market.category}
                      className="w-7 h-7 text-muted-foreground"
                    />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                <div className="absolute top-2 right-2 glass rounded-full px-2 py-0.5">
                  <span className="text-[30px] font-bold neon-yes">
                    {displayPercent}%
                  </span>
                </div>
                {market.autoResolve && market.autoResolveAsset && (
                  <div className="absolute top-2 left-2 glass rounded-full px-2 py-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                    <span className="text-[10px] font-bold text-foreground">
                      {market.autoResolveAsset}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-2.5 space-y-1">
                <h4 className="text-xs font-bold leading-snug line-clamp-2">
                  {market.title}
                </h4>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{market.participants} traders</span>
                  <span>{formatVolume(market.volume)}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {markets.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {markets.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className={`rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? "w-4 h-1.5 bg-primary"
                  : "w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryCarousel;
