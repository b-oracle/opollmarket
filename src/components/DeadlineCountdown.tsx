import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface Props {
  /** ISO timestamp when the market resolves. */
  endsAt: string;
  className?: string;
  /** Optional label prefix, e.g. "Resolves in". Defaults to icon only. */
  label?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Formats the remaining time:
 *  - >= 24h → "Xd Yh"
 *  - >= 1h  → "HH:MM:SS"
 *  - <  1h  → "MM:SS"
 *  - <= 0   → "Ended"
 */
const format = (ms: number) => {
  if (ms <= 0) return "Ended";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  if (days >= 1) {
    const hours = Math.floor((total % 86400) / 3600);
    return `${days}d ${hours}h`;
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours >= 1) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
};

/**
 * Live ticking countdown until a market resolves. Ticks every second when
 * under 24h to give a precise feel; switches to a 30s tick beyond that to
 * avoid burning CPU on long-dated markets.
 */
const DeadlineCountdown = ({ endsAt, className, label }: Props) => {
  const endMs = new Date(endsAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const remaining = endMs - Date.now();
    // High-frequency only when it actually matters
    const interval = remaining > 24 * 60 * 60 * 1000 ? 30_000 : 1_000;
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [endMs]);

  const remaining = endMs - now;
  const ended = remaining <= 0;
  const urgent = !ended && remaining < 60 * 60 * 1000; // < 1h

  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${
        urgent ? "text-destructive font-semibold" : ""
      } ${className ?? ""}`}
      aria-label={ended ? "Market ended" : `Resolves in ${format(remaining)}`}
    >
      <Clock className="w-3 h-3 shrink-0" />
      {label ? <span>{label}</span> : null}
      <span>{format(remaining)}</span>
    </span>
  );
};

export default DeadlineCountdown;
