import { useState, useEffect, useRef } from "react";

interface PriceToBeatHeaderProps {
  openPrice: number | null;
  currentPrice: number | null;
  closePrice?: number | null;
  resolveFlash: "win" | "lose" | null;
  formatPrice: (price: number) => string;
  pricePrefix: string;
  userBetSide?: string | null;
}

/**
 * Polymarket-style price block:
 *   PRICE TO BEAT          CURRENT PRICE   ▲ $17
 *   $80,225.81             $80,242.93
 * Bold, dominant, dollar-delta chip in green/red.
 */
export default function PriceToBeatHeader({
  openPrice,
  currentPrice,
  closePrice,
  resolveFlash,
  formatPrice,
  pricePrefix,
  userBetSide,
}: PriceToBeatHeaderProps) {
  const [displayPrice, setDisplayPrice] = useState<string | null>(null);
  const animRef = useRef<number | null>(null);
  const isResolving = resolveFlash !== null;

  // Slot-machine animation on resolve
  useEffect(() => {
    if (!isResolving || closePrice == null || currentPrice == null) {
      setDisplayPrice(null);
      return;
    }
    const start = currentPrice;
    const end = closePrice;
    const duration = 1200;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const interpolated = start + (end - start) * eased;
      setDisplayPrice(formatPrice(interpolated));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayPrice(formatPrice(end));
      }
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isResolving, closePrice, currentPrice, formatPrice]);

  if (openPrice == null) return null;

  const dollarDelta =
    currentPrice != null ? currentPrice - openPrice : null;
  const isUp = dollarDelta !== null ? dollarDelta >= 0 : null;

  const rightPrice =
    isResolving && displayPrice
      ? displayPrice
      : currentPrice != null
        ? formatPrice(currentPrice)
        : "—";

  const rightLabel = isResolving ? "Final Price" : "Current Price";
  const rightLabelColor = isResolving
    ? resolveFlash === "win"
      ? "text-green-500"
      : "text-destructive"
    : "text-amber-500";
  const rightPriceColor = isResolving
    ? resolveFlash === "win"
      ? "text-green-500"
      : "text-destructive"
    : "text-amber-500";

  // Format dollar delta with sign and rounding (whole dollars when |Δ| ≥ 1, else 2dp)
  const fmtDelta = (d: number) => {
    const abs = Math.abs(d);
    if (abs >= 1) return `$${Math.round(abs).toLocaleString()}`;
    return `$${abs.toFixed(2)}`;
  };

  return (
    <div className="flex items-end gap-6 px-1 py-2">
      {/* Left: Price to Beat */}
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Price to Beat
        </span>
        <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-muted-foreground/80 leading-none">
          {pricePrefix}{formatPrice(openPrice)}
        </span>
      </div>

      {/* Right: Current / Final Price + delta */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${rightLabelColor}`}>
            {rightLabel}
          </span>
          {dollarDelta !== null && !isResolving && (
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums leading-none ${
                isUp ? "text-green-500" : "text-destructive"
              }`}
            >
              <span className="text-[8px]">{isUp ? "▲" : "▼"}</span>
              {fmtDelta(dollarDelta)}
            </span>
          )}
          {isResolving && userBetSide && (
            <span
              className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                resolveFlash === "win"
                  ? "bg-green-500 text-white"
                  : "bg-destructive text-white"
              }`}
            >
              {resolveFlash === "win" ? "WIN" : "LOSE"}
            </span>
          )}
        </div>
        <span
          className={`text-2xl sm:text-3xl font-extrabold tabular-nums leading-none transition-colors duration-300 ${rightPriceColor}`}
        >
          {pricePrefix}{rightPrice}
        </span>
      </div>
    </div>
  );
}
