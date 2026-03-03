import { useRef, useCallback } from "react";

/**
 * Client-side rate limiter hook.
 * Returns a function that checks if an action is allowed based on time window.
 */
export const useRateLimit = (maxActions: number, windowMs: number) => {
  const timestamps = useRef<number[]>([]);

  const checkLimit = useCallback((): boolean => {
    const now = Date.now();
    // Remove expired timestamps
    timestamps.current = timestamps.current.filter((t) => now - t < windowMs);
    if (timestamps.current.length >= maxActions) {
      return false; // Rate limited
    }
    timestamps.current.push(now);
    return true; // Allowed
  }, [maxActions, windowMs]);

  const remaining = useCallback((): number => {
    const now = Date.now();
    timestamps.current = timestamps.current.filter((t) => now - t < windowMs);
    return Math.max(0, maxActions - timestamps.current.length);
  }, [maxActions, windowMs]);

  const timeUntilReset = useCallback((): number => {
    if (timestamps.current.length === 0) return 0;
    const oldest = timestamps.current[0];
    return Math.max(0, windowMs - (Date.now() - oldest));
  }, [windowMs]);

  return { checkLimit, remaining, timeUntilReset };
};
