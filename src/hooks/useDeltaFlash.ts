import { useEffect, useRef, useState } from "react";

/**
 * Tracks recent change in a numeric value. Returns the signed delta vs the
 * previous stable value. Auto-clears to null after `clearMs` so the indicator
 * shows briefly and fades.
 */
export function useDeltaFlash(value: number, clearMs = 2500): number | null {
  const prevRef = useRef<number>(value);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    if (value !== prev) {
      const d = value - prev;
      if (d !== 0) {
        setDelta(d);
        prevRef.current = value;
        const t = setTimeout(() => setDelta(null), clearMs);
        return () => clearTimeout(t);
      }
    }
  }, [value, clearMs]);

  return delta;
}
