import { useCryptoRoundChance } from "@/hooks/useCryptoRoundChance";
import AnimatedNumber from "@/components/AnimatedNumber";

interface Props {
  asset?: string;
  openPrice?: number;
  fallbackPercent: number;
  className?: string;
}

/**
 * Shows live "% chance Up" for crypto Up/Down round markets, derived from the
 * live spot price vs the round's open price. Falls back to yes_price-derived
 * percent when no live price is available yet. Tweens between values.
 */
export default function LiveCryptoRoundPercent({
  asset,
  openPrice,
  fallbackPercent,
  className,
}: Props) {
  const live = useCryptoRoundChance(asset, openPrice);
  const pct = live != null ? live * 100 : fallbackPercent;
  return <AnimatedNumber value={pct} suffix="%" className={`${className ?? ""} tabular-nums`} />;
}
