import { useEffect, useState } from "react";
import { subscribeToPriceStream, subscribeToSmoothedPriceStream } from "@/lib/cryptoPriceProvider";

/**
 * For an active crypto Up/Down round market, derive a live "% chance Up wins"
 * from the live price vs the round's open (target) price.
 *
 * Heuristic: scaled tanh on percent move, so a tiny price tick already nudges
 * the % chance — matching Polymarket-style continuous price feel.
 *
 * Returns null if asset/open are unknown so callers can fall back to yes_price.
 */
export function useCryptoRoundChance(
  asset: string | null | undefined,
  openPrice: number | null | undefined,
): number | null {
  const [livePrice, setLivePrice] = useState<number | null>(null);

  useEffect(() => {
    if (!asset) return;
    const sym = asset.toUpperCase();
    const unsubWs = subscribeToPriceStream(sym, (p) => setLivePrice(p));
    const unsubSmooth = subscribeToSmoothedPriceStream(sym, (p) => {
      // Only use smoothed if WS hasn't delivered yet
      setLivePrice((prev) => prev ?? p);
    });
    return () => {
      try { unsubWs(); } catch {}
      try { unsubSmooth(); } catch {}
    };
  }, [asset]);

  if (!asset || openPrice == null || openPrice <= 0 || livePrice == null) return null;

  const pctMove = (livePrice - openPrice) / openPrice; // signed
  // tanh(pctMove * 80) → ~1% move ≈ 66% chance, ~2% move ≈ 92% chance.
  const chanceUp = 0.5 + Math.tanh(pctMove * 80) / 2;
  return Math.max(0.02, Math.min(0.98, chanceUp));
}
