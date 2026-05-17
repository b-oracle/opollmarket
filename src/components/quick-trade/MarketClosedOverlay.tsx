import { Moon } from "lucide-react";
import { useMarketOpenCountdown } from "@/lib/marketHours";
import NextOpenTimeLabel from "@/components/NextOpenTimeLabel";

/** Countdown + "Market Closed" overlay for non-crypto assets */
export default function MarketClosedOverlay({ assetClass }: { assetClass: string }) {
  const countdown = useMarketOpenCountdown(assetClass);

  return (
    <div className="relative h-[220px] overflow-hidden rounded-lg bg-muted/10 border border-destructive/30">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-destructive/15 border border-destructive/30">
          <Moon className="w-6 h-6 text-destructive" />
          <span className="text-base font-extrabold text-destructive uppercase tracking-widest">Market Closed</span>
        </div>
        <p className="text-xs text-muted-foreground font-medium">{nextOpen}</p>
        {countdown && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card/80 border border-border">
            <span className="text-xs text-muted-foreground">Opens in</span>
            <span className="text-base font-bold tabular-nums text-foreground">{countdown}</span>
          </div>
        )}
      </div>
    </div>
  );
}
