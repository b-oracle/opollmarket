import { useState, useEffect, useCallback } from "react";
import { getNextOpenDate } from "@/lib/marketHours";

const STORAGE_KEY = "market_hours_tz_pref"; // "et" | "local"

function formatIn(date: Date, tz: "ET" | "LOCAL"): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz === "ET" ? "America/New_York" : undefined,
    timeZoneName: "short",
  });
  return fmt.format(date);
}

interface Props {
  assetClass: string;
  className?: string;
}

/**
 * Renders the next market-open time with a toggle between ET (canonical schedule)
 * and the user's local timezone. Preference persists in localStorage.
 */
export default function NextOpenTimeLabel({ assetClass, className }: Props) {
  const [mode, setMode] = useState<"ET" | "LOCAL">(() => {
    if (typeof window === "undefined") return "LOCAL";
    return (localStorage.getItem(STORAGE_KEY) as "ET" | "LOCAL") || "LOCAL";
  });
  const [next, setNext] = useState<Date | null>(() => getNextOpenDate(assetClass));

  useEffect(() => {
    const tick = () => setNext(getNextOpenDate(assetClass));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [assetClass]);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMode((m) => {
      const next = m === "ET" ? "LOCAL" : "ET";
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  if (!next) return null;
  const label = `Opens ${formatIn(next, mode)}`;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <span>{label}</span>
      <button
        type="button"
        onClick={toggle}
        className="px-1.5 py-0.5 rounded-md border border-border bg-card/60 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        title={`Switch to ${mode === "ET" ? "your local time" : "Eastern Time"}`}
        aria-label="Toggle timezone"
      >
        {mode === "ET" ? "ET" : "Local"}
      </button>
    </span>
  );
}
