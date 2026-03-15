import { useState, useEffect, useRef } from "react";
import { Target, Flag } from "lucide-react";

interface PriceToBeatHeaderProps {
  openPrice: number | null;
  currentPrice: number | null;
  closePrice?: number | null;
  resolveFlash: "win" | "lose" | null;
  formatPrice: (price: number) => string;
  pricePrefix: string;
  userBetSide?: string | null;
}

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
      // Ease-out cubic
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

  const liveDelta =
    currentPrice != null && openPrice
      ? ((currentPrice - openPrice) / openPrice) * 100
      : null;

  const isUp = liveDelta !== null ? liveDelta >= 0 : null;

  const rightPrice = isResolving && displayPrice
    ? displayPrice
    : currentPrice != null
      ? formatPrice(currentPrice)
      : "—";

  const rightLabel = isResolving ? "Final Price" : "Current Price";
  const RightIcon = isResolving ? Flag : Target;

  return (
    <div className="flex items-stretch gap-2 rounded-xl border border-border bg-muted/30 overflow-hidden">
      {/* Left: Price to Beat */}
      <div className="flex-1 px-3 py-2.5 flex flex-col items-center justify-center border-r border-border/50">
        <div className="flex items-center gap-1 mb-0.5">
          <Target className="w-3 h-3 text-amber-500" />
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
            Price to Beat
          </span>
        </div>
        <span className="text-base font-bold font-mono tabular-nums text-foreground">
          {pricePrefix}{formatPrice(openPrice)}
        </span>
      </div>

      {/* Right: Current / Final Price */}
      <div className="flex-1 px-3 py-2.5 flex flex-col items-center justify-center relative">
        <div className="flex items-center gap-1 mb-0.5">
          <RightIcon className={`w-3 h-3 ${isResolving ? (resolveFlash === "win" ? "text-green-500" : "text-destructive") : "text-muted-foreground"}`} />
          <span className={`text-[9px] font-semibold uppercase tracking-wider ${
            isResolving
              ? resolveFlash === "win" ? "text-green-500" : "text-destructive"
              : "text-muted-foreground"
          }`}>
            {rightLabel}
          </span>
        </div>
        <span className={`text-base font-bold font-mono tabular-nums transition-colors duration-300 ${
          isResolving
            ? resolveFlash === "win" ? "text-green-500" : "text-destructive"
            : isUp === true ? "text-green-500" : isUp === false ? "text-destructive" : "text-foreground"
        }`}>
          {pricePrefix}{rightPrice}
        </span>

        {/* Delta badge */}
        {liveDelta !== null && !isResolving && (
          <span className={`text-[9px] font-semibold mt-0.5 ${isUp ? "text-green-500" : "text-destructive"}`}>
            {isUp ? "+" : ""}{liveDelta.toFixed(3)}%
          </span>
        )}

        {/* Win/Lose badge on resolve */}
        {isResolving && userBetSide && (
          <div className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-bl-lg text-[8px] font-black uppercase tracking-wider ${
            resolveFlash === "win"
              ? "bg-green-500 text-white"
              : "bg-destructive text-white"
          }`}>
            {resolveFlash === "win" ? "WIN" : "LOSE"}
          </div>
        )}
      </div>
    </div>
  );
}
