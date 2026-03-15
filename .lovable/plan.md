

# Restore Legacy Fallback Paths to QuickTradeChart

## Problem
The current `QuickTradeChart.tsx` is still the "rebuilt" version — the surgical restore didn't actually bring back the legacy fallback code. When the engine isn't ready (common in preview where WebSockets are blocked), the chart stays stuck on "Building chart..." indefinitely.

## What's Missing
The original March 13 version had **fallback rendering paths** between gates 4 and 5 that would display charts using raw `priceHistory` and `ohlcData` while the engine accumulated data. These were stripped during the rebuild and never restored.

## Plan
Overwrite `src/components/quick-trade/QuickTradeChart.tsx` with the **exact original version** from the `<current-code>` block at the start of this conversation. This is a byte-for-byte restoration — no modifications, no "improvements."

The original file is 259 lines and contains:
- `ChartSkeleton` helper
- `BucketBadges` helper  
- `EngineAreaChart` sub-component
- Main `QuickTradeChart` with the correct gate sequence including legacy fallbacks

## Files Changed

| File | Change |
|---|---|
| `src/components/quick-trade/QuickTradeChart.tsx` | Full overwrite with original March 13 version |

