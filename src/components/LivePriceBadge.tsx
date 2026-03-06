import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
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

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold tabular-nums backdrop-blur-sm ${
        conditionMet
          ? "bg-green-500/15 border border-green-500/30 text-green-600 dark:text-green-400"
          : "bg-primary/10 border border-primary/20 text-primary"
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
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
    </div>
  );
};

export default LivePriceBadge;
