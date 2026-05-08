import { useEffect, useState } from "react";

interface Props {
  endsAt: string;
  className?: string;
}

const fmt = (ms: number) => {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * Bold, animated realtime countdown for crypto Up/Down rounds.
 * Color shifts green → amber → red (pulsing) as the round nears expiry.
 */
export default function CryptoRoundLiveCountdown({ endsAt, className }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = new Date(endsAt).getTime() - now;

  if (remaining <= 0) {
    return (
      <span
        role="timer"
        aria-live="polite"
        className={`text-xl sm:text-2xl font-extrabold tracking-tight text-red-500/70 tabular-nums ${className ?? ""}`}
      >
        Resolving…
      </span>
    );
  }

  const sec = Math.ceil(remaining / 1000);
  let color = "text-green-500";
  let urgent = false;
  if (sec <= 15) {
    color = "text-red-500";
    urgent = true;
  } else if (sec <= 60) {
    color = "text-amber-400";
  }

  return (
    <span
      role="timer"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums ${color} ${urgent ? "animate-pulse" : ""} ${className ?? ""}`}
    >
      {urgent && (
        <span className="relative flex items-center">
          <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
      )}
      <span key={sec} className="inline-block animate-fade-in">
        {fmt(remaining)}
      </span>
    </span>
  );
}
