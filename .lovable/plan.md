

# Rebuild QuickTradeChart Rendering Logic from Scratch

## Problem
The chart rendering component (`QuickTradeChart.tsx`) has accumulated layered patches — multiple loading gates, a legacy fallback path, and duplicated area chart code — making the flow hard to follow and causing stale/frozen chart states.

## Approach
Rewrite `QuickTradeChart.tsx` from scratch with a clean, linear rendering pipeline. The **ChartEngine** (`chartEngine.ts`), **useChartEngine hook**, **SVGCandleChart**, **TradingViewChart**, and **MarketClosedOverlay** all stay untouched — only the orchestrator component gets rebuilt.

## New `QuickTradeChart.tsx` Design

Clean top-down render priority:

```text
1. Market closed?        → <MarketClosedOverlay />
2. TradingView mode?     → <TradingViewChart />
3. History loading?      → <Skeleton "Loading chart..." />
4. No streaming price?   → <Skeleton "Connecting to live feed..." />
5. Engine not ready?     → <Skeleton "Building chart..." />
6. chartType === candle   → <SVGCandleChart /> + bucket badges
7. chartType === area     → <AreaChart /> (engine line points) + bucket badges
```

Key simplifications:
- **Remove the entire legacy fallback** (lines 261-327). No more rendering from raw `priceHistory` — everything goes through the engine. The `priceHistory` and `ohlcData` props are kept in the interface (passed through to TV chart) but unused for area/candle rendering.
- **Single skeleton component** extracted as a local function (DRY — currently duplicated 3 times).
- **One area chart block** instead of the current two (engine + legacy).
- **Clear linear flow** — no nested `hasEngineData` checks or fallthrough paths.

## Files Changed

| File | Change |
|---|---|
| `src/components/quick-trade/QuickTradeChart.tsx` | Full rewrite — same props interface, clean render pipeline |

## What stays the same
- `ChartEngine` class and all candle logic
- `useChartEngine` hook
- `SVGCandleChart` component
- `TradingViewChart` component (726 lines, untouched)
- `MarketClosedOverlay`
- All props passed from `QuickTrade.tsx`
- All price streaming / history fetching logic in `QuickTrade.tsx`

## Risk
Low — this is a pure presentation component rewrite. Same inputs, same outputs, just cleaner control flow. The engine and data layer are completely untouched.

