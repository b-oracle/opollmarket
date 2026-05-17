// Market hours utility for Forex & Commodities
// Forex: Sunday 5:00 PM ET – Friday 5:00 PM ET
// Commodities: same window for simplicity
// Crypto: 24/7
import { useEffect, useState } from "react";

type AssetClassType = "crypto" | "forex" | "commodity";

/** Convert current time to US Eastern (handles DST automatically) */
function getETNow(): { day: number; hour: number; minute: number } {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  return { day: et.getDay(), hour: et.getHours(), minute: et.getMinutes() };
}

/** Forex & commodity markets: open Sunday 17:00 ET → Friday 17:00 ET */
function isTradingWindowOpen(): boolean {
  const { day, hour } = getETNow();

  // Saturday → always closed
  if (day === 6) return false;

  // Sunday → open only from 17:00 onward
  if (day === 0) return hour >= 17;

  // Friday → open only until 17:00
  if (day === 5) return hour < 17;

  // Mon–Thu → always open
  return true;
}

/** Check if a market is currently open based on asset class */
export function isMarketOpen(assetClass: AssetClassType | string): boolean {
  if (assetClass === "crypto") return true;
  return isTradingWindowOpen();
}

/** Get a human-readable next open time string */
export function getNextOpenTime(assetClass: AssetClassType | string): string {
  if (assetClass === "crypto") return "";

  const { day, hour } = getETNow();

  // If Saturday or Sunday before 17:00 → opens Sunday 5:00 PM ET
  if (day === 6 || (day === 0 && hour < 17)) {
    return "Opens Sunday 5:00 PM ET";
  }

  // If Friday after 17:00 → opens Sunday 5:00 PM ET
  if (day === 5 && hour >= 17) {
    return "Opens Sunday 5:00 PM ET";
  }

  return "Opens Sunday 5:00 PM ET";
}

/** Get a short status label */
export function getMarketStatusLabel(assetClass: AssetClassType | string): string {
  if (isMarketOpen(assetClass)) return "Live";
  return "Market Closed";
}

/** Returns the next market-open Date (Sunday 17:00 ET) for a closed asset class, or null if open / 24-7. */
export function getNextOpenDate(assetClass: AssetClassType | string): Date | null {
  if (isMarketOpen(assetClass)) return null;
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const offsetMs = now.getTime() - et.getTime(); // ET → UTC drift
  const target = new Date(et);
  const day = et.getDay();
  const daysUntilSun = day === 0 ? (et.getHours() < 17 ? 0 : 7) : 7 - day;
  target.setDate(et.getDate() + daysUntilSun);
  target.setHours(17, 0, 0, 0);
  return new Date(target.getTime() + offsetMs);
}

/** Formats a millisecond duration as "Dd HHh MMm SSs" (or "HH:MM:SS" if <24h). */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Opening…";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** React hook: live-updating countdown string to the next market open. Empty string when open. */
export function useMarketOpenCountdown(assetClass: AssetClassType | string): string {
  const [text, setText] = useState(() => {
    const t = getNextOpenDate(assetClass);
    return t ? formatCountdown(t.getTime() - Date.now()) : "";
  });
  useEffect(() => {
    const tick = () => {
      const t = getNextOpenDate(assetClass);
      setText(t ? formatCountdown(t.getTime() - Date.now()) : "");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [assetClass]);
  return text;
}
