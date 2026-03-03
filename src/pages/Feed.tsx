import { useState, useRef, useEffect, useMemo } from "react";
import MarketCard from "@/components/MarketCard";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { mockMarkets } from "@/data/markets";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";

const Feed = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { boostedMarketIds } = useActiveBoosts();

  // Sort: boosted markets first, then trending, then rest
  const sortedMarkets = useMemo(() => {
    return [...mockMarkets].sort((a, b) => {
      const aBoost = boostedMarketIds.has(a.id) ? 2 : a.trending ? 1 : 0;
      const bBoost = boostedMarketIds.has(b.id) ? 2 : b.trending ? 1 : 0;
      return bBoost - aBoost;
    });
  }, [boostedMarketIds]);

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

  return (
    <div className="h-dvh flex flex-col bg-background">
      <TopBar />
      <div
        ref={containerRef}
        className="flex-1 snap-feed pt-14 pb-0"
      >
        {sortedMarkets.map((market, i) => (
          <MarketCard
            key={market.id}
            market={market}
            isActive={i === activeIndex}
            isBoosted={boostedMarketIds.has(market.id)}
          />
        ))}
      </div>
      <BottomNav />
    </div>
  );
};

export default Feed;
