import { useState, useRef, useCallback } from "react";
import { useAnimation } from "framer-motion";

const PULL_THRESHOLD = 80;
const DAMPEN_FACTOR = 0.45;
const MAX_PULL = 120;

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  scrollRef?: React.RefObject<HTMLElement | null>;
}

interface UsePullToRefreshReturn {
  pulling: boolean;
  pullDistance: number;
  refreshing: boolean;
  pullProgress: number;
  spinControls: ReturnType<typeof useAnimation>;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

export function usePullToRefresh({ onRefresh, scrollRef }: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const hapticFired = useRef(false);
  const spinControls = useAnimation();

  const getScrollTop = useCallback(() => {
    if (scrollRef?.current) return scrollRef.current.scrollTop;
    return window.scrollY;
  }, [scrollRef]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    if (getScrollTop() > 5) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, [refreshing, getScrollTop]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return;
    if (getScrollTop() > 5) {
      isPulling.current = false;
      setPulling(false);
      setPullDistance(0);
      return;
    }
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY > 10) {
      // Prevent native overscroll/bounce when we're handling the pull
      try { e.preventDefault(); } catch (_) { /* passive listener fallback */ }
      const dampened = Math.min(deltaY * DAMPEN_FACTOR, MAX_PULL);
      setPulling(true);
      setPullDistance(dampened);
      if (dampened >= PULL_THRESHOLD && !hapticFired.current) {
        navigator.vibrate?.(15);
        hapticFired.current = true;
      }
    }
  }, [refreshing, getScrollTop]);

  const onTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(50);
      spinControls.start({ rotate: 360, transition: { repeat: Infinity, duration: 0.8, ease: "linear" } });
      await onRefresh();
      spinControls.stop();
      setRefreshing(false);
    }

    setPulling(false);
    setPullDistance(0);
    hapticFired.current = false;
  }, [pullDistance, refreshing, onRefresh, spinControls]);

  const pullProgress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return {
    pulling,
    pullDistance,
    refreshing,
    pullProgress,
    spinControls,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
