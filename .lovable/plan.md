

## Canvas 2D Candlestick Chart Optimization

### What We're Doing

Rewrite `SimpleCandleChart.tsx` from SVG to Canvas 2D using the same pattern already proven in `PolylineChart.tsx` — Float64Array ring buffer, `requestAnimationFrame` draw loop, and HTML overlay badges updated at ~10fps.

### Changes

**1. Rewrite `src/components/quick-trade/SimpleCandleChart.tsx`**

Replace the SVG implementation with Canvas 2D, mirroring the PolylineChart architecture:

- **Ring buffer**: Store OHLC + volume data in a `Float64Array` (5 fields per candle: ts, open, high, low, close) plus a separate volume array
- **RAF draw loop**: Draw candle wicks (`ctx.moveTo/lineTo`), bodies (`ctx.fillRect`), volume bars, grid lines, MA lines, and entry price line imperatively — zero React reconciliation
- **Y-axis hysteresis**: Keep the existing expand-instantly / contract-gradually domain logic, but in refs instead of `useMemo`
- **MA computation**: Compute MA7/MA14 inside the draw loop from the buffer (or accept precomputed MAs), draw as `ctx.beginPath/lineTo` polylines
- **Active candle glow**: Draw a semi-transparent rect behind the last candle when it's still open
- **HTML overlays**: Price badges (current price, entry price, grid labels) remain as positioned divs, updated via `setOverlay` at ~10fps — same pattern as PolylineChart
- **Props interface**: Unchanged — same `ohlcData`, `priceHistory`, `entryPrice`, `streamingPrice`, `precomputedMAs`, `fullscreen` props

**2. `SVGCandleChart.tsx`** — No changes (it's used separately by the chart engine view and isn't in the hot path)

### Expected Performance Gain

| Metric | SVG (current) | Canvas 2D |
|---|---|---|
| DOM nodes per frame | ~180 (60 candles × 3 elements) | 1 (`<canvas>`) |
| React reconciliation | Every price tick | None (badges only at 10fps) |
| Draw method | Browser SVG layout engine | Direct pixel commands |

Same architecture as the PolylineChart rewrite — proven pattern, just drawing rectangles and lines instead of a polyline.

