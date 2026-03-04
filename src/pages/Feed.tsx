import SEOHead from "@/components/SEOHead";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import MarketCard from "@/components/MarketCard";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useMarkets } from "@/hooks/useMarkets";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import { Loader2 } from "lucide-react";
import { motion, useAnimation } from "framer-motion";

const PULL_THRESHOLD = 80;

const Feed = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: markets = [], isLoading, refetch } = useMarkets();
  const { boostedMarketIds, boostDetails } = useActiveBoosts();

  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const hapticFired = useRef(false);
  const spinControls = useAnimation();

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || container.scrollTop > 5 || refreshing) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return;
    const container = containerRef.current;
    if (!container || container.scrollTop > 5) {
      isPulling.current = false;
      setPulling(false);
      setPullDistance(0);
      return;
    }
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY > 0) {
      const dampened = Math.min(deltaY * 0.45, 120);
      setPulling(true);
      setPullDistance(dampened);
      if (dampened >= PULL_THRESHOLD && !hapticFired.current) {
        navigator.vibrate?.(15);
        hapticFired.current = true;
      }
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(50);
      spinControls.start({
        rotate: 360,
        transition: { repeat: Infinity, duration: 0.8, ease: "linear" },
      });
      await refetch();
      spinControls.stop();
      setRefreshing(false);
    }

    setPulling(false);
    setPullDistance(0);
    hapticFired.current = false;
  }, [pullDistance, refreshing, refetch, spinControls]);

  if (isLoading) {
    return (
      <div className="h-dvh flex flex-col bg-background items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return (
    <div className="h-dvh flex flex-col bg-background">
      <SEOHead title="Feed" description="Swipe through prediction markets like TikTok. Vote YES or NO on real-world events." path="/feed" />
      <TopBar />

      {/* Pull-to-refresh indicator */}
      <motion.div
        className="fixed left-0 right-0 z-40 flex items-center justify-center pointer-events-none md:max-w-2xl md:mx-auto"
        style={{ top: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
        initial={{ opacity: 0, y: -20 }}
        animate={{
          opacity: pulling || refreshing ? 1 : 0,
          y: pulling || refreshing ? pullDistance * 0.3 : -20,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-strong">
          <motion.div
            animate={refreshing ? spinControls : { rotate: pullProgress * 180 }}
            transition={{ type: "tween", duration: 0 }}
          >
            <Loader2 className={`w-4 h-4 text-primary ${refreshing ? '' : ''}`} />
          </motion.div>
          <span className="text-xs font-medium text-muted-foreground">
            {refreshing ? "Refreshing…" : pullProgress >= 1 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      </motion.div>

      <div
        ref={containerRef}
        className="flex-1 snap-feed pt-14 md:max-w-2xl md:mx-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
