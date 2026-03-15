

# Fix: Replace Stale Paused Chart with Loading State Until Live Streaming Begins

## Problem
When opening the Quick Trade chart, there's a gap between "historical data loaded" and "engine ready + live streaming active." During this gap (can be minutes), the chart renders a **static, frozen line** from cached data — the "stale paused state" in the screenshot. The user sees a declining red line that doesn't move, giving the impression the app is broken.

**Root cause sequence:**
1. `historyLoading` goes `false` as soon as raw cached/fetched data arrives
2. Engine isn't ready yet (`hasEngineData = false`) — needs history init + streaming ticks
3. Legacy fallback renders immediately with stale cached data → static frozen chart
4. Eventually engine catches up and takes over → chart becomes live

The gap between steps 2 and 4 is the "stuck" period.

## Solution
Instead of falling through to the legacy static chart when the engine isn't ready, show the **loading skeleton** until `streamingPrice` is non-null (meaning live data is actually flowing). This replaces the frozen chart with an animated loading state that clearly communicates "connecting to live data."

## Changes

### File: `src/components/quick-trade/QuickTradeChart.tsx`

**Replace the two "Waiting for price data..." fallback blocks (lines 112-122 and 226-232):**

- When `hasEngineData` is false AND `streamingPrice` is null → show the animated loading skeleton (same as `historyLoading` state) with text "Connecting to live feed..."
- When `hasEngineData` is false AND `streamingPrice` exists but engine still building → show loading skeleton with "Building chart..."  
- Only fall through to legacy static chart if engine data is explicitly unavailable (e.g., `engineReady` prop not passed at all — backward compat)

Specifically:
1. After the `historyLoading` check (line 88), add a new check: if `chartType !== "tv"` and `!engineReady` and `streamingPrice == null`, show loading skeleton with "Connecting to live feed..."
2. Change the `!hasEngineData` block (lines 112-122): if engine exists but isn't ready yet (`engineReady === false`), show loading skeleton with "Building chart..." instead of falling to legacy
3. Remove or gate the legacy fallback (lines 222-288) so it only renders when engine props are not provided at all

This ensures the user **never** sees a frozen static chart — they see either the loading animation or the live engine-powered chart.

### File: `src/hooks/useChartEngine.ts`

No changes needed — the `ready` state already works correctly.

### File: `src/pages/QuickTrade.tsx`  

No changes needed — already seeds priceHistory and passes engineReady prop.

