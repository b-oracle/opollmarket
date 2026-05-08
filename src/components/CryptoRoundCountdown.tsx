import { useEffect, useState } from "react";

interface Props {
  /** Round end timestamp (ISO). */
  endsAt: string;
  className?: string;
}

const formatRemaining = (ms: number) => {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/**
 * Compact LIVE pill + mm:ss countdown for auto-spawned crypto Up/Down rounds.
 * Mimics the style of Polymarket's per-round cards.
 */
const CryptoRoundCountdown = ({ endsAt, className }: Props) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = new Date(endsAt).getTime() - now;
  const ended = remaining <= 0;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${className ?? ""}`}
    >
      <span className="relative flex items-center">
        <span className="absolute inline-flex h-2 w-2 rounded-full bg-destructive opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
      </span>
      <span className="uppercase tracking-wider text-destructive">
        {ended ? "Resolving" : "Live"}
      </span>
      {!ended && (
        <span className="font-mono tabular-nums text-foreground">
          {formatRemaining(remaining)}
        </span>
      )}
    </span>
  );
};

export default CryptoRoundCountdown;
