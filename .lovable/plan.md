

## Polymarket-Style Quick Trade Enhancements

Two features to add: a prominent "Price to Beat / Final Price" header and a past rounds timeline strip.

---

### 1. Price to Beat + Final Price Header

**What it does:** Replaces the current small "Open: $xxx" text line with a prominent, Polymarket-style header section showing:
- **"Price to Beat"** label with the round's open price displayed large and bold
- **"Current Price"** alongside it with live color-coded updates
- **On resolution:** The current price area transforms into a **"Final Price"** display with a brief slot-machine counting animation that lands on the close price, plus a green/red WIN/LOSE badge

**Location:** Inside the chart card (`chartCardRef`), between the price/countdown header and the chart timeframe selector (replacing the existing `activeRound?.open_price` section at ~line 1389).

**Technical approach:**
- Create a new component `PriceToBeatHeader.tsx` in `src/components/quick-trade/`
- Props: `openPrice`, `currentPrice`, `closePrice`, `resolveFlash`, `formatPrice`, `pricePrefix`, `userBetSide`
- When `resolveFlash` triggers, run a 1.5s CSS counter animation on the final price digits using `requestAnimationFrame` interpolation from current → close price
- Display layout: two columns — left shows "Price to Beat" + open price, right shows "Current Price" (or "Final Price" on resolve) with the animated number

**File changes:**
- **New:** `src/components/quick-trade/PriceToBeatHeader.tsx`
- **Edit:** `src/pages/QuickTrade.tsx` — replace the existing open price reference block (~lines 1389-1400) with the new component; pass resolve state

---

### 2. Past Rounds Timeline Bar

**What it does:** A horizontal scrollable strip below the chart showing the last ~10 completed rounds as compact pills. Each pill shows:
- Green/red dot for UP/DOWN result
- Timestamp (e.g. "2:05 PM")
- Price delta percentage (e.g. "+0.12%")
- Tapping a pill could highlight it (optional)

**Location:** Below the chart, above the pool info cards (~