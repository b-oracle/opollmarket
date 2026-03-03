import { useState, useRef, useEffect } from "react";
import MarketCard from "@/components/MarketCard";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { mockMarkets } from "@/data/markets";

const Feed = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
        {mockMarkets.map((market, i) => (
          <MarketCard key={market.id} market={market} isActive={i === activeIndex} />
        ))}
      </div>
      <BottomNav />
    </div>
  );
};

export default Feed;
