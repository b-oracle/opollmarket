import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { getAssetClass } from "@/data/assetClasses";

const ASSET_GECKO_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana",
  XRP: "ripple", ADA: "cardano", DOGE: "dogecoin", MATIC: "matic-network",
  AVAX: "avalanche-2", DOT: "polkadot", LINK: "chainlink", SHIB: "shiba-inu",
};

const METAL_MAP: Record<string, string> = {
  XAU: "gold", XAG: "silver", XPT: "platinum", XPD: "palladium",
};

async function fetchPrice(asset: string): Promise<number | null> {
  const cls = getAssetClass(asset);
  try {
    if (cls === "crypto") {
      const id = ASSET_GECKO_MAP[asset.toUpperCase()];
      if (!id) return null;
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
      if (!r.ok) return null;
      const d = await r.json();
      return d[id]?.usd ?? null;
    }
    if (cls === "commodity") {
      const metal = METAL_MAP[asset];
      if (!metal) return null;
      const r = await fetch(`https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz`);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.metals?.[metal] ?? null;
    }
    if (cls === "forex") {
      const [base, quote] = asset.split("/");
      if (!base || !quote) return null;
      const r = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d?.rates?.[quote] ?? null;
    }
  } catch {
    // silent
  }
  return null;
}

interface LivePriceBadgeProps {
  asset: string;
  targetPrice?: number;
  operator?: string;
}

const OP_LABELS: Record<string, string> = {
  above: ">", below: "<", at_or_above: "≥", at_or_below: "≤",
};

const LivePriceBadge = ({ asset, targetPrice, operator }: LivePriceBadgeProps) => {
  const [price, setPrice] = useState<number | null>(null);
  const [prev, setPrev] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  const cls = getAssetClass(asset);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const p = await fetchPrice(asset);
      if (p != null && !cancelled) {
        setPrev(price);
        setPrice(p);
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

  // Progress toward target (0–100%)
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
      className={`inline-flex flex-col rounded-lg text-[10px] font-bold tabular-nums backdrop-blur-sm transition-all duration-500 overflow-hidden ${
        flash === "up"
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
      {/* Proximity alert banner */}
      {proximityTier === "imminent" && !conditionMet && (
        <div className="flex items-center justify-center gap-1 px-2 py-0.5 bg-amber-500/25 text-amber-600 dark:text-amber-300 text-[9px] font-bold animate-pulse">
          🔥 Almost there! {progress}% to target
        </div>
      )}
      {proximityTier === "close" && !conditionMet && (
        <div className="flex items-center justify-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-600 dark:text-yellow-300 text-[9px] font-semibold">
          ⚡ Approaching target — {progress}%
        </div>
      )}
      {conditionMet && (
        <div className="flex items-center justify-center gap-1 px-2 py-0.5 bg-green-500/25 text-green-600 dark:text-green-300 text-[9px] font-bold">
          ✅ Condition met!
        </div>
      )}
      <div className="flex items-center gap-1 px-2 py-1">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${
          proximityTier === "imminent" ? "bg-amber-500" : proximityTier === "close" ? "bg-yellow-500" : "bg-destructive"
        }`} />
        <span>{asset}</span>
        <span className={dir === "up" ? "text-green-500" : dir === "down" ? "text-destructive" : ""}>
          {formatted}
        </span>
        {dir === "up" && <TrendingUp className="w-2.5 h-2.5" />}
        {dir === "down" && <TrendingDown className="w-2.5 h-2.5" />}
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
};

export default LivePriceBadge;
