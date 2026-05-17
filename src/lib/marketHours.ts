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
