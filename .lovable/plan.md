

## Diagnosis

The chart goes flat because the **Binance WebSocket** (`wss://stream.binance.com:9443`) is being silently blocked in the preview environment. Here's what happens:

1. Initial Binance REST API call loads historical data successfully (the active part of the chart)
2. WebSocket connection fails silently -- no `onmessage` events fire
3. After 3 seconds, the HTTP fallback kicks in, but it polls at 1.5s intervals with a **jitter of just 0.00035** (~$0.025 on a $70k asset), which is invisible
4. The Y-axis domain padding is `±0.0001` (±$7 on BTC) -- too small to show any variation

The chart appeared "vibrant yesterday" because the WebSocket was likely working then, providing dozens of real price ticks per second.

## Plan

### 1. Make HTTP fallback kick in faster and poll more aggressively
**File: `src/pages/QuickTrade.tsx`**
- Reduce WS detection timeout from **3 seconds → 1.5 seconds**
- When WS is not active, poll Binance REST API every **1 second** (down from 1.5s)
- Increase jitter from `0.00035` to **`0.002`** (~$1.40 on BTC) so the chart visually moves between real fetches
- Between real fetches, generate **micro-ticks** using a separate 80ms interval that interpolates between the last two real prices with slight randomness, keeping the chart alive at ~12fps even during the 1s poll gap

### 2. Improve Y-axis scaling for visible movement
**File: `src/components/quick-trade/QuickTradeChart.tsx`**
- Change Y-axis domain padding from `d * 0.0001` to **`d * 0.001`** (10x more room), so small price movements actually show visible chart movement
- This applies to the area chart's `<Y