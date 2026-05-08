import React, { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Moon } from "lucide-react";
import { toast } from "sonner";
const loadConfetti = () => import("canvas-confetti").then(m => m.default);
import { getAssetClass } from "@/data/assetClasses";
import { fetchAssetPrice } from "@/lib/cryptoPriceProvider";
import { isMarketOpen, getNextOpenTime } from "@/lib/marketHours";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const OP_LABELS: Record<string, string> = {
  above: ">", below: "<", at_or_above: "≥", at_or_below: "≤",
};

interface LivePriceBadgeProps {
  asset: string;
  targetPrice?: number;
  operator?: string;
  /** When provided, target-progress toasts only fire for users who currently
   *  hold an open position (shares > 0) in this market. */
  marketId?: string;
}

const LivePriceBadge = React.forwardRef<HTMLDivElement, LivePriceBadgeProps>(({ asset, targetPrice, operator, marketId }, ref) => {
  const [price, setPrice] = useState<number | null>(null);
  const [prev, setPrev] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const toastFiredRef = useRef(false);
  const metToastFiredRef = useRef(false);
  const priceRef = useRef<number | null>(null);

  const cls = getAssetClass(asset);
  const marketOpen = isMarketOpen(cls);
  const nextOpen = !marketOpen ? getNextOpenTime(cls) : "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const p = await fetchAssetPrice(asset);
      if (p != null && !cancelled) {
        setPrev(priceRef.current);
        setPrice(p);
        priceRef.current = p;

        // Fire a one-time toast when crossing the 95% threshold
        if (!toastFiredRef.current && targetPrice != null && targetPrice > 0 && operator) {
          const prog = (operator === "above" || operator === "at_or_above")
            ? Math.min(Math.round((p / targetPrice) * 100), 100)
            : (operator === "below" || operator === "at_or_below")
              ? Math.min(Math.round((targetPrice / p) * 100), 100)
              : null;

          const met = operator === "above" ? p > targetPrice
            : operator === "below" ? p < targetPrice
            : operator === "at_or_above" ? p >= targetPrice
            : operator === "at_or_below" ? p <= targetPrice
            : false;

          const isForex = cls === "forex";
          const targetLabel = isForex ? targetPrice.toFixed(4) : `$${targetPrice.toLocaleString()}`;

          if (met && !metToastFiredRef.current) {
            metToastFiredRef.current = true;
            toastFiredRef.current = true;
            toast.success(`✅ ${asset} hit the target — resolution eligible!`, {
              description: `Target: ${targetLabel}`,
              duration: 10000,
            });
            loadConfetti().then(confetti => confetti({
              particleCount: 50,
              spread: 60,
              origin: { y: 0.7 },
              colors: ["hsl(193,98%,50%)", "#ffffff", "hsl(142,71%,45%)"],
              zIndex: 9999,
              gravity: 1.2,
              scalar: 0.8,
            }));
          } else if (prog != null && prog >= 95 && !met && !toastFiredRef.current) {
            toastFiredRef.current = true;
            toast.warning(`🔥 ${asset} is ${prog}% toward its target!`, {
              description: `Target: ${targetLabel}`,
              duration: 8000,
            });
          }
        }
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [asset]);

  // Trigger flash when price changes
  useEffect(() => {
    if (price != null && prev != null && price !== prev) {
      setFlash(price > prev ? "up" : "down");
      const timeout = setTimeout(() => setFlash(null), 800);
      return () => clearTimeout(timeout);
    }
  }, [price, prev]);

  if (price == null) return null;

  const dir = prev != null ? (price > prev ? "up" : price < prev ? "down" : "flat") : "flat";
  const isForex = cls === "forex";
  const formatted = isForex ? price.toFixed(4) : `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const conditionMet = targetPrice != null && operator != null && (
    operator === "above" ? price > targetPrice :
    operator === "below" ? price < targetPrice :
    operator === "at_or_above" ? price >= targetPrice :
    operator === "at_or_below" ? price <= targetPrice :
    false
  );

  const progress = targetPrice != null && targetPrice > 0
    ? (operator === "above" || operator === "at_or_above")
      ? Math.min(Math.round((price / targetPrice) * 100), 100)
      : (operator === "below" || operator === "at_or_below")
        ? Math.min(Math.round((targetPrice / price) * 100), 100)
        : null
    : null;

  const proximityTier = progress != null
    ? progress >= 100 ? "met" : progress >= 95 ? "imminent" : progress >= 90 ? "close" : null
    : null;

  return (
    <div
      ref={ref}
      className={`inline-flex flex-col rounded-lg text-[10px] font-bold tabular-nums backdrop-blur-sm transition-all duration-500 overflow-hidden ${
        !marketOpen
          ? "bg-muted/30 border border-muted-foreground/20 text-muted-foreground"
          : flash === "up"
            ? "bg-green-500/25 border border-green-500/40 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
            : flash === "down"
              ? "bg-destructive/25 border border-destructive/40 shadow-[0_0_8px_hsl(var(--destructive)/0.3)]"
              : conditionMet
                ? "bg-green-500/15 border border-green-500/30 text-green-600 dark:text-green-400"
                : proximityTier === "imminent"
                  ? "bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                  : proximityTier === "close"
                    ? "bg-yellow-500/15 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400"
                    : "bg-primary/10 border border-primary/20 text-primary"
      }`}
    >
      {!marketOpen && (
        <div className="flex items-center justify-center gap-1 px-2 py-0.5 bg-muted/40 text-muted-foreground text-[9px] font-semibold">
          <Moon className="w-2.5 h-2.5" />
          Market Closed · {nextOpen}
        </div>
      )}
      {marketOpen && proximityTier === "imminent" && !conditionMet && (
        <div className="flex items-center justify-center gap-1 px-2 py-0.5 bg-amber-500/25 text-amber-600 dark:text-amber-300 text-[9px] font-bold animate-pulse">
          🔥 Almost there! {progress}% to target
        </div>
      )}
      {marketOpen && proximityTier === "close" && !conditionMet && (
        <div className="flex items-center justify-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-600 dark:text-yellow-300 text-[9px] font-semibold">
          ⚡ Approaching target — {progress}%
        </div>
      )}
      {marketOpen && conditionMet && (
        <div className="flex items-center justify-center gap-1 px-2 py-0.5 bg-green-500/25 text-green-600 dark:text-green-300 text-[9px] font-bold">
          ✅ Condition met!
        </div>
      )}
      <div className="flex items-center gap-1 px-2 py-1">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          !marketOpen
            ? "bg-muted-foreground/40"
            : proximityTier === "imminent" ? "bg-amber-500 animate-pulse" : proximityTier === "close" ? "bg-yellow-500 animate-pulse" : "bg-green-500 animate-pulse"
        }`} />
        <span>{asset}</span>
        <span className={!marketOpen ? "text-muted-foreground" : dir === "up" ? "text-green-500" : dir === "down" ? "text-destructive" : ""}>
          {!marketOpen && <span className="text-[9px] mr-0.5">Last:</span>}
          {formatted}
        </span>
        {marketOpen && dir === "up" && <TrendingUp className="w-2.5 h-2.5" />}
        {marketOpen && dir === "down" && <TrendingDown className="w-2.5 h-2.5" />}
        {targetPrice != null && operator && (
          <span className="text-muted-foreground ml-0.5">
            {OP_LABELS[operator] || "="} {isForex ? targetPrice.toFixed(4) : `$${targetPrice.toLocaleString()}`}
          </span>
        )}
        {progress != null && (
          <span className={`ml-0.5 px-1 py-px rounded text-[9px] font-bold ${
            conditionMet
              ? "bg-green-500/20 text-green-600 dark:text-green-400"
              : proximityTier === "imminent"
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                : proximityTier === "close"
                  ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                  : "bg-primary/15 text-primary"
          }`}>
            {progress}%
          </span>
        )}
      </div>
      {progress != null && (
        <div className="h-[3px] w-full bg-muted/30">
          <div
            className={`h-full rounded-r-full transition-all duration-700 ease-out ${
              conditionMet ? "bg-green-500"
                : proximityTier === "imminent" ? "bg-amber-500"
                : proximityTier === "close" ? "bg-yellow-500"
                : "bg-primary"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
});

export default LivePriceBadge;
