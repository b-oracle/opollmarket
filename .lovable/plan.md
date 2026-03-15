

## Speeding Up the Polymarket-Style Chart

### Analysis: Why Ours Feels Slower

The data source is **not** the bottleneck. Binance WebSocket already delivers sub-second trade ticks -- faster than Chainlink Streams (~1s updates). The slowness is in the **rendering pipeline**:

| Bottleneck | Current | Impact |
|---|---|---|
| Chart point append throttle | 80ms (~12fps) | Limits how often new points appear on the line |
| Every tick triggers `setPriceHistory` | Full React re-render | SVG polyline with 500 points re-computed via `useMemo` on every update |
| SVG DOM with 500+ points | Re-painted each render | Browser recalculates entire polyline path string |
| Lerp interpolation loop | 40ms (25fps) | Good, but gated by the 80ms chart append |

Polymarket likely uses **Canvas 2D** (not SVG) and direct imperative drawing, which avoids React's reconciliation overhead entirely. They also only redraw the visible viewport, not the full history.

### About Chainlink Data

Chainlink Streams provide cryptographically-signed price feeds at ~1s intervals. While reliable, they're **slower** than Binance WS raw trades. The speed you perceive on Polymarket is from their rendering, not their data source. Integrating Chainlink would add complexity (requires API key, off-chain verification) without improving chart speed.

### Optimization Plan

#### 1. Convert PolylineChart to Canvas 2D (biggest win)

Replace the SVG-based `PolylineChart.tsx` with a `<canvas>` element and imperative `requestAnimationFrame` drawing loop:

- Draw the line path directly via `ctx.lineTo()` -- no DOM nodes to reconcile
- Only redraw when price changes (skip identical frames)
- Draw the pulsing dot via canvas arc with opacity oscillation
- Target and grid lines drawn imperatively
- Price labels remain as positioned HTML divs overlaid on the canvas

This eliminates React re-renders for the chart body entirely.

**File**: `src/components/quick-trade/PolylineChart.tsx` -- rewrite internals

#### 2. Decouple price tip from full chart redraw

Split the rendering into two layers:
- **Static layer**: The historical line path (redrawn only when new point appended, ~12fps)
- **Dynamic layer**: The tip dot + current price badge (updated at full WS speed, ~25fps via RAF)

The tip position interpolates smoothly between the last plotted point and the current streaming price without triggering a full path redraw.

**File**: `src/components/quick-trade/PolylineChart.tsx`

#### 3. Reduce chart append throttle

In `QuickTrade.tsx`, reduce `appendCryptoChartPoint` throttle from 80ms to 50ms (~20fps) for the poly chart type, giving more data points and smoother visual movement.

**File**: `src/pages/QuickTrade.tsx` -- adjust throttle constant

#### 4. Use typed array for price data

Replace the array-of-objects `priceHistory` with a flat `Float64Array` ring buffer stored in a ref. The canvas draws directly from the buffer without creating intermediate objects. This eliminates GC pressure from creating hundreds of `{ time, price, ts }` objects per minute.

**File**: `src/components/quick-trade/PolylineChart.tsx`

### Files Changed

| File | Change |
|---|---|
| `src/components/quick-trade/PolylineChart.tsx` | Rewrite from SVG to Canvas 2D with RAF loop, dual-layer rendering, ring buffer |
| `src/pages/QuickTrade.tsx` | Reduce append throttle for poly chart, pass streaming price ref directly to canvas |

### Expected Result

- Chart tip updates at true 25fps+ (matching Polymarket's smoothness)
- Historical line redraws at 20fps with zero React re-renders
- Memory-stable ring buffer instead of growing/trimming arrays
- Pulsing dot and price badge animate independently of data flow

