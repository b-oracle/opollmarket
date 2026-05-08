import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Animation duration in ms. Default 450ms. */
  duration?: number;
  /** Number of decimals to display. Default 0. */
  decimals?: number;
  /** Optional formatter. Receives the tweened value. */
  format?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Smoothly tweens between numeric values whenever `value` changes.
 * Uses requestAnimationFrame + cubic ease-out for natural motion.
 */
export default function AnimatedNumber({
  value,
  duration = 450,
  decimals = 0,
  format,
  className,
  prefix,
  suffix,
}: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const text = format
    ? format(display)
    : decimals === 0
      ? Math.round(display).toString()
      : display.toFixed(decimals);

  return (
    <span className={className}>
      {prefix}{text}{suffix}
    </span>
  );
}
