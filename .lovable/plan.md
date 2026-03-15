

# Restore QuickTradeChart.tsx to March 13 State

## What happened
The original `QuickTradeChart.tsx` (shown at the start of this conversation) had a working rendering pipeline that included legacy fallback paths. Our recent "rebuild" stripped those fallbacks, leaving the chart stuck on "Building chart..." skeletons when the engine takes time to accumulate candles.

## Plan
Restore `src/components/quick-trade/QuickTradeChart.tsx` to the exact version from the `<current-code>` block at the start of this conversation — the pre-modification version. This is the version that was working on March 13.

Key differences being restored:
- **Legacy area chart fallback** using raw `priceHistory` — shows a static-but-visible chart while the engine initializes
- **Legacy candle chart fallback** using `ohlcData` — same purpose for candle mode
- **Original loading/skeleton logic** with the previous gate sequence
- **All engine-powered paths** still present — they take over once the engine is ready

## File changed
| File | Change |
|---|---|
| `src/components/quick-trade/QuickTradeChart.tsx` | Full restore to March 13 version |

This is a direct rollback of the orchestrator component. No other files are affected — `SVGCandleChart`, `TradingViewChart`, `MarketClosedOverlay`, `useChartEngine`, `chartEngine` all remain as-is.

