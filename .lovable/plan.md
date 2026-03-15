

# Chart Initialization & Market-Closed Detection Fixes

## Problems Identified

### 1. Chart stuck on "Waiting for price data..." for minutes on load
**Root cause:** The chart rendering has a waterfall dependency chain:
- `fetchRawPriceData` must complete (network call)
- `priceHistory` must have >= 2 points after time-window filtering
- `useChartEngine` needs `priceHistory.length >= 2` to initialize
- Only THEN does the chart render

For crypto, the initial `fetchCryptoHistory` call to Binance can take several seconds. Until streaming ticks also accumulate, the engine stays in `ready: false` state. The area chart legacy fallback also requires `filtered.length >= 2` — so the user sees "Waiting for price data..." for an extended period.

**Fix:** Show a more responsive initial state by:
- Immediately rendering the chart with whatever data is available once `streamingPrice` arrives (even a single point)
- In `QuickTradeChart`, when engine isn't ready AND we have at least 1 price point, show a minimal line from that single point rather than the empty "Waiting" state
- Reduce the "ready" threshold from `candles.length >= 2` to `>= 1` in the engine hook

### 2. Forex/commodity: shows "Waiting for price data..." instead of "Market Closed" overlay
**Root cause:** When market is closed, the streaming effect (line 516-530) fetches ONE price snapshot but does NOT populate `priceHistory`. So `priceHistory` stays empty. The chart component's logic is:
1. Check `hasEngineData` (engine candles >= 2) → false
2. Fall through to legacy: filter `priceHistory` → `filtered.length < 2` → true
3. Check `isMarketOpen()` → false → should show MarketClosedOverlay

BUT there's a timing issue: `historyLoading` starts `true` (line 410), and the loading skeleton is shown first (line 60-83). For non-crypto closed markets, `fetchRawPriceData` calls `getNonCryptoHistory()` which returns the polling history — but polling never starts when market is closed (line 654 starts poller only when `!marketOpen` is false... wait, actually line 517 returns early when `!marketOpen`, so the non-crypto poller at line 655 never starts). But line 399-423 still runs `fetchRawPriceData` which returns empty for non-crypto with no history. So `historyLoading` goes false, but `priceHistory` is empty.

The real issue: the engine check at line 105 (`hasEngineData`) blocks the market-closed check. When engine has no data, it falls to line 107-121 which DOES check market closed correctly. So this should work...

Let me re-examine: the `historyLoading` flag. Line 408 sets it false if cache exists. Line 410 sets it true if no cache. Line 420 sets it false after fetch completes. So the loading skeleton shows briefly, then goes away. After that, the component should hit the `filtered.length < 2` check and show MarketClosedOverlay.

**Actually**, looking more carefully at the screenshots: image-123 shows the line chart with "CLOSED" badge but the chart IS rendering (it's showing a declining line). Image-124 shows the MarketClosedOverlay appearing when switching to 5m timeframe. So the issue is that on the **1m** timeframe with the area chart, the chart renders old cached data as a line (the red declining line in image-123) instead of showing the Market Closed overlay. Only when switching timeframes (which clears/re-filters data) does the overlay appear correctly.

So the real bug: **when market is closed, stale cached `priceHistory` data from a previous session still passes the `filtered.length >= 2` check** on the 1m timeframe (because the data points are recent enough to be within the 1-minute window from sessionStorage cache), so the chart renders a stale line instead of the MarketClosedOverlay. On longer timeframes like 5m, the stale data may still be within range too, but fewer points, so it flips to the overlay.

### 3. ShareModal ref warning
The `ShareModal` component is a regular function component that receives a ref from `QuickTrade` but doesn't use `forwardRef`.

## Plan

### File: `src/components/quick-trade/QuickTradeChart.tsx`
- **Add a market-closed check BEFORE the engine/legacy data checks.** If `isMarketOpen(assetClass)` is false AND `chartType !== "tv"`, immediately return `<MarketClosedOverlay />`. This eliminates the dependency on price data for displaying the closed state.
- This is the most impactful fix — closed markets should never try to render price charts.

### File: `src/hooks/useChartEngine.ts`
- Lower the `ready` threshold from `candles.length >= 2` to `candles.length >= 1` so a single data point is enough to start rendering.

### File: `src/pages/QuickTrade.tsx`
- For the initial bootstrap fetch (line 533-542), also seed `priceHistory` with the fetched price point so the chart has at least one data point immediately instead of waiting for streaming ticks to accumulate.
- Same for the market-closed single fetch (line 519-526) — seed `priceHistory` with the snapshot price.

### File: `src/components/ShareModal.tsx`
- Wrap with `forwardRef` to fix the console warning.

## Impact Assessment
- **QuickTradeChart.tsx**: Low risk — adding an early return for closed markets is purely additive and doesn't affect open-market rendering.
- **useChartEngine.ts**: Low risk — relaxing the ready threshold from 2 to 1 candle.
- **QuickTrade.tsx**: Low risk — seeding initial price point is additive.
- **ShareModal.tsx**: Low risk — wrapping in forwardRef is a standard pattern.

