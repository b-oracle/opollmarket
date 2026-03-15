

## Problem Analysis

The `ChartEngine` (in `src/lib/chartEngine.ts`) and `useChartEngine` hook already implement correct timeframe-based OHLC aggregation, wall-clock bucket alignment, live candle lifecycle, and countdown timing. The engine is instantiated in `QuickTrade.tsx` and its output (`engineCandles`, `engineLinePoints`, `bucketCountdown`, etc.) is passed as props to `QuickTradeChart`.

**However, `QuickTradeChart` completely ignores the engine data.** It renders `SimpleCandleChart` with raw `ohlcData`/`priceHistory` and `SimpleAreaChart` with raw `priceHistory` -- neither of which respects the selected timeframe for candle formation.

## Plan

### 1. Wire engine candles into SimpleCandleChart

**File: `src/components/quick-trade/QuickTradeChart.tsx`**

- When `engineReady` is true and `engineCandles` has data, pass engine candles to `SimpleCandleChart` instead of raw `ohlcData`/`priceHistory`.
- Convert `Candle[]` from the engine (which has `ts`, `open`, `high`, `low`, `close`, `volume`, `ma7`, `ma14`) into the format `SimpleCandleChart` expects (`OHLCCandle[]` with `time`, `open`, `high`, `low`, `close`).
- Remove the `streamingPrice` prop pass-through since the engine already incorporates streaming ticks into the active candle.
- Fall back to raw data only when engine is not yet ready.

### 2. Wire engine line points into SimpleAreaChart

**File: `src/components/quick-trade/QuickTradeChart.tsx`**

- When `engineReady` is true and `engineLinePoints` has data, convert them to the `{ time, price, ts }` format and pass to `SimpleAreaChart` instead of raw `priceHistory`.
- Fall back to raw `priceHistory` when engine is not ready.

### 3. Pass MAs from engine to SimpleCandleChart

**File: `src/components/quick-trade/SimpleCandleChart.tsx`**

- Add an optional `precomputedMAs` prop (or include `ma7`/`ma14` in the candle data) so the chart uses engine-computed MAs instead of recomputing them internally.
- When engine candles include `ma7`/`ma14`, skip the internal MA calculation and use those values directly for the MA polylines.

### 4. Ensure countdown badge reflects engine bucket timing

Already wired -- `BucketBadges` receives `bucketCountdown` and `bucketProgress` from engine. No change needed, but verify the countdown format handles hours (for 1H/4H/1D timeframes) by updating the `fmt` function to show `h:mm:ss` when countdown exceeds 60 minutes.

### 5. Update countdown formatter for larger timeframes

**File: `src/components/quick-trade/QuickTradeChart.tsx`**

- Update `BucketBadges.fmt()` to handle hours: e.g. `1:23:45` for 1H+ timeframes.

### Summary of changes

| File | Change |
|---|---|
| `QuickTradeChart.tsx` | Use `engineCandles` / `engineLinePoints` as primary data source; convert formats; update countdown formatter |
| `SimpleCandleChart.tsx` | Accept pre-computed MA values from engine candles; skip internal MA calc when provided |

No changes needed to `chartEngine.ts`, `useChartEngine.ts`, or `QuickTrade.tsx` -- the engine logic is already correct. The fix is purely about connecting the engine output to the renderers.

