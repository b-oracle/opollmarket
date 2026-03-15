import { useState, useEffect } from "react";
import { Moon } from "lucide-react";
import { getNextOpenTime } from "@/lib/marketHours";

/** Countdown + "Market Closed" overlay for non-crypto assets */
export default function MarketClosedOverlay({ assetClass }: { assetClass: string }) {
  const nextOpen = getNextOpenTime(assetClass);

  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
      const et = new Date(etStr);
      const day = et.getDay(); // 0=Sun..6=Sat
      const hour = et.getHours();

      // Next open is Sunday 17:00 ET
      let daysUntil: number;
      if (day === 0) {
        // Sunday: if before 17:00, opens today; if after, next Sunday
        daysUntil = hour < 17 ? 0 : 7;
      } else {
        // Mon-Sat: next Sunday
        daysUntil = 7 - day;
      }

      const target = new Date(et);
      target.setDate(target.getDate() + daysUntil);
      target.setHours(17, 0, 0, 0);

      const diff = target.getTime() - et.getTime();
      if (diff <= 0) return "Opening soon...";

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      return `${h}h ${m}m ${s}s`;
    };
    setCountdown(calc());
    const interval = setInterval(() => setCountdown(calc()), 1000);
    return () => clearInterval(interval);
  }, []);

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
