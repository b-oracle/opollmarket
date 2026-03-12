

## Fix: Candle bucket duration to match selected chart timeframe

### Problem
In `TradingViewChart.tsx` line 378-379, the streaming candle bucket is hardcoded to **10 seconds**:
```ts
const bucketSec = 10;
const candleTime = (Math.floor(nowSec / bucketSec) * bucketSec) as UTCTimestamp;
```
This means a new candle is created every 10 seconds regardless of whether the user selected 1m, 5m, 15m, 1h, or 1D — causing the rapid candle creation you're seeing.

### Fix
1. **Pass the chart timeframe key to `TradingViewChart`** — add a new prop or derive the candle interval from the existing `chartMs` prop.

2. **Map each timeframe to a proper candle bucket duration:**
   - 1m → 60-second candles (each candle = 1 second of data makes no sense; standard is 1 candle per timeframe unit)
   - 5m → 60-second candles (5 min window, ~5 candles)
   - 15m → 60-second candles (~15 candles)
   - 1h → 300-second (5 min) candles (~12 candles)
   - 1D → 3600-second (1 hour) candles (~24 candles)

   The mapping: `bucketSec = Math.max(60, Math.floor(chartMs / 1000 / 60))` — targeting roughly 60 candles for visual density while ensuring minimum 60s buckets.

3. **Update the hardcoded `bucketSec = 10`** in the streaming animation loop (line 378) to use the computed bucket size.

4. **Also fix the fallback `buildData` function** (line 146) which uses `CANDLE_BUCKETS = 60` — this is fine for initial data but should be consistent.

### Files to edit
- `src/components/TradingViewChart.tsx` — Replace hardcoded `bucketSec = 10` with a value derived from `chartMs`

