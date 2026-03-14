

## Plan: Surgically Revert Today's Chart Changes

Today's changes touched 3 files. Here's what gets reverted in each:

### 1. `src/lib/cryptoPriceProvider.ts`
- **CACHE_TTL**: Revert from `1_500` back to `5_000`
- **Provider order**: Remove Binance as first provider in `fetchCryptoPrice`, restore original order (CoinGecko → CoinCap → CryptoCompare)
- **CHART_CACHE_PREFIX**: Revert from `qt_chart_v2_` to `qt_chart_`
- Keep the `fetchFromBinanceSpot` function (it's harmless), just remove it from the priority chain

### 2. `src/pages/QuickTrade.tsx`
- **Remove WS stale detection**: Remove `lastWsTickAtRef`, `WS_STALE_MS`, and all stale-checking logic
- **Remove micro-tick interpolation**: Remove the entire `microTickIv` 80ms interval that generates fake price ticks
- **Restore original HTTP fallback**: Simple 5s polling with original jitter of `0.0001` (not `0.002`)
- **Restore buffer size**: Back to `500` points (not `2000`)
- **Restore poll interval**: Back to `5000ms` (not `1000ms`)
- **Restore cache prefix**: `qt_chart_` (not `qt_chart_v2_`)

### 3. `src/components/quick-trade/QuickTradeChart.tsx`
- **Y-axis domain padding**: Revert from `d * 0.001` back to `d * 0.0001`

### Why this should fix it
The original code relied on the **Binance WebSocket** working naturally for chart vibrancy. Today's changes added layers of artificial interpolation, aggressive polling, and jitter that likely conflict with the natural WS stream — creating a situation where the fallback logic interferes with real data flow, producing the flat appearance.

