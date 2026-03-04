import { useState, useRef, useEffect, useMemo } from "react";
import MarketCard from "@/components/MarketCard";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useMarkets } from "@/hooks/useMarkets";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import { Loader2 } from "lucide-react";

const Feed = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: markets = [], isLoading } = useMarkets();
  const { boostedMarketIds, boostDetails } = useActiveBoosts();

  const sortedMarkets = useMemo(() => {
    return [...markets].sort((a, b) => {
      const aBoost = boostedMarketIds.has(a.id) ? 2 : a.trending ? 1 : 0;
      const bBoost = boostedMarketIds.has(b.id) ? 2 : b.trending ? 1 : 0;
      return bBoost - aBoost;
    });
  }, [markets, boostedMarketIds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const itemHeight = container.clientHeight;
      const index = Math.round(container.scrollTop / itemHeight);
      setActiveIndex(index);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="h-dvh flex flex-col bg-background items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-background">
      <TopBar />
      <div ref={containerRef} className="flex-1 snap-feed pt-14 md:max-w-2xl md:mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
            />
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
};

export default Feed;
