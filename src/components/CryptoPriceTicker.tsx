import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, TrendingUp, TrendingDown, Radio, BarChart3, ArrowLeftRight } from "lucide-react";
import { getAssetClass, type AssetClass } from "@/data/assetClasses";

const ASSET_GECKO_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  SHIB: "shiba-inu",
};

const METAL_MAP: Record<string, string> = {
  XAU: "gold",
  XAG: "silver",
  XPT: "platinum",
  XPD: "palladium",
};

const OP_LABELS: Record<string, string> = {
  above: ">",
  below: "<",
  at_or_above: "≥",
  at_or_below: "≤",
};

const OP_TEXT: Record<string, string> = {
  above: "closes above",
  below: "closes below",
  at_or_above: "reaches or exceeds",
  at_or_below: "drops to or below",
};

async function fetchAssetPrice(asset: string): Promise<number | null> {
  const assetClass = getAssetClass(asset);
  
  if (assetClass === "crypto") {
    const geckoId = ASSET_GECKO_MAP[asset.toUpperCase()];
    if (!geckoId) return null;
    try {
      const resp = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data[geckoId]?.usd ?? null;
    } catch {
      return null;
    }
  }
  
  if (assetClass === "commodity") {
    const metalName = METAL_MAP[asset];
    if (metalName) {
      try {
        const resp = await fetch(`https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz`);
        if (!resp.ok) return null;
        const data = await resp.json();
        return data?.metals?.[metalName] ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }
  
  if (assetClass === "forex") {
    const [base, quote] = asset.split("/");
    if (!base || !quote) return null;
    try {
      const resp = await fetch(`https://api.frankfurter.app/latest?from=${base}&to=${quote}`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.rates?.[quote] ?? null;
    } catch {
      return null;
    }
  }
  
  return null;
}

interface CryptoPriceTickerProps {
  asset: string;
  targetPrice: number;
  operator: string;
  deadline?: string;
}

export default function CryptoPriceTicker({ asset, targetPrice, operator, deadline }: CryptoPriceTickerProps) {
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const assetClass = getAssetClass(asset);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const price = await fetchAssetPrice(asset);
        if (price != null) {
          setPrevPrice(currentPrice);
          setCurrentPrice(price);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 30_000);
    return () => clearInterval(interval);
  }, [asset]);

  const priceDirection = currentPrice != null && prevPrice != null
    ? currentPrice > prevPrice ? "up" : currentPrice < prevPrice ? "down" : "neutral"
    : "neutral";

  const progress = currentPrice != null
    ? operator === "above" || operator === "at_or_above"
      ? Math.min((currentPrice / targetPrice) * 100, 100)
      : Math.min((targetPrice / currentPrice) * 100, 100)
    : 0;

  const conditionMet = currentPrice != null && (
    operator === "above" ? currentPrice > targetPrice :
    operator === "below" ? currentPrice < targetPrice :
    operator === "at_or_above" ? currentPrice >= targetPrice :
    operator === "at_or_below" ? currentPrice <= targetPrice :
    false
  );

  const deadlineStr = deadline
    ? new Date(deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
    : null;

  // Dynamic labels based on asset class
  const headerLabel = assetClass === "forex" ? "Forex Auto-Resolve" : assetClass === "commodity" ? "Commodity Auto-Resolve" : "Auto-Resolve";
  const HeaderIcon = assetClass === "forex" ? ArrowLeftRight : assetClass === "commodity" ? BarChart3 : Zap;
  const priceLabel = assetClass === "forex" ? asset : `${asset}/USD`;
  const formatPrice = (p: number) => {
    if (assetClass === "forex") {
      return p.toFixed(4);
    }
    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden mb-4">
      {/* Header with LIVE badge */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
            <HeaderIcon className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30">
          <Radio className="w-3 h-3 text-destructive animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Live</span>
        </div>
      </div>

      {/* Price ticker */}
      <div className="px-4 py-3">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{priceLabel} Current</p>
            {loading ? (
              <div className="h-8 w-32 bg-muted/50 rounded animate-pulse" />
            ) : currentPrice != null ? (
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentPrice}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={`text-2xl font-bold tabular-nums ${
                    priceDirection === "up" ? "text-green-500" : priceDirection === "down" ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {assetClass === "forex" ? "" : "$"}{formatPrice(currentPrice)}
                  {priceDirection === "up" && <TrendingUp className="inline w-4 h-4 ml-1.5 -translate-y-0.5" />}
                  {priceDirection === "down" && <TrendingDown className="inline w-4 h-4 ml-1.5 -translate-y-0.5" />}
                </motion.p>
              </AnimatePresence>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Target</p>
            <p className="text-lg font-bold text-foreground tabular-nums">
              {OP_LABELS[operator] || "="} {assetClass === "forex" ? "" : "$"}{assetClass === "forex" ? targetPrice.toFixed(4) : targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-2 rounded-full bg-muted/50 overflow-hidden mb-2">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${conditionMet ? "bg-green-500" : "bg-primary"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
          <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/50" style={{ left: "100%" }} />
        </div>

        {/* Condition summary */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Resolves <span className="font-semibold text-foreground">YES</span> if {priceLabel} {OP_TEXT[operator] || operator}{" "}
            <span className="font-semibold text-foreground">{assetClass === "forex" ? "" : "$"}{assetClass === "forex" ? targetPrice.toFixed(4) : targetPrice.toLocaleString()}</span>
          </p>
          {conditionMet && (
            <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
              ✓ Condition Met
            </span>
          )}
        </div>

        {deadlineStr && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Deadline: <span className="font-semibold text-foreground">{deadlineStr}</span>
          </p>
        )}
      </div>
    </div>
  );
}