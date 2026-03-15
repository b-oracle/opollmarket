

## Polymarket-Style Line Chart for Quick Trade

### What We're Building

A new "Polymarket-style" smooth line chart option that users can toggle between alongside the existing candlestick chart. This chart mimics Polymarket's clean aesthetic: thick smooth line, no area gradient fill, horizontal "Target" price badge, time axis labels along the bottom, and a pulsing dot at the current price tip.

### Changes

**1. New Component: `src/components/quick-trade/PolylineChart.tsx`**

A clean SVG line chart inspired by Polymarket's style:
- **Smooth thick line** (~0.6 strokeWidth) with rounded joins — no area fill underneath
- **"Target" badge** at the entry/open price line (styled like Polymarket's green "Target" label on the right edge)
- **Pulsing dot** at the line tip (current price) with a subtle glow animation
- **Time axis labels** along the bottom showing timestamps at regular intervals (e.g., every 5th data point)
- **Color logic**: Line is green when price is above target/entry, orange/red when below
- Same Y-axis hysteresis system as `SimpleAreaChart` for smooth domain transitions
- Same props interface as `SimpleAreaChart` for drop-in compatibility

**2. Edit: `src/pages/QuickTrade.tsx`**

- Add `"poly"` to the chart type union: `"area" | "candle" | "tv" | "poly"`
- Add a new toggle button in the chart type selector toolbar (next to the existing Line/Candle/TV buttons) with a distinct icon (e.g., `Activity` from lucide for the smooth line look)
- Wire the new `PolylineChart` component into `QuickTradeChart` rendering logic — when `chartType === "poly"`, render `PolylineChart` with the same `priceHistory` data used by `SimpleAreaChart`
- The "poly" chart type should respect the existing `lineChartEnabled` feature toggle (shared with area chart) or be always available — since it's a line variant, it will share the toggle

**3. Edit: `src/components/quick-trade/QuickTradeChart.tsx`**

- Import and render `PolylineChart` when `chartType === "poly"`, passing the same props as the area chart

### Visual Differences from Current Area Chart

| Aspect | Current Area Chart | Polymarket-Style |
|---|---|---|
| Fill | Gradient area fill | No fill — line only |
| Line thickness | Thin (0.4) | Thicker (0.6-0.8) |
| Line tip | None | Pulsing dot with glow |
| Target line | Dashed amber line | Solid line with "Target" badge |
| Time axis | None | Timestamp labels at bottom |
| Overall feel | Basic area chart | Clean, modern Polymarket look |

