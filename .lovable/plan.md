

## Problem

The fullscreen chart view has two major issues visible in the screenshot:

1. **Chart is tiny and centered** -- the SVG has a fixed `height: 220px` (`CHART_H = 220`) and a hardcoded `viewBox` of `0 0 100 220`. In fullscreen, the `flex items-center justify-center` wrapper centers this small SVG in a massive viewport, leaving huge empty dark areas above and below.

2. **Volume bars appear as disconnected dots** -- because the SVG is being stretched horizontally to fill width but the viewBox coordinates are tiny (0-85 range), the volume bars and candles become distorted at wide aspect ratios.

## Root Cause

`SimpleCandleChart` renders a fixed `220px` tall SVG with `width: 85%`. In the normal inline view this looks fine, but in fullscreen the parent is `100vh` tall. The SVG doesn't scale to fill the vertical space -- it stays at 220px and gets centered.

## Plan

### A. Make SimpleCandleChart responsive to container height (primary fix)

**File: `src/components/quick-trade/SimpleCandleChart.tsx`**
- Accept an optional `fullscreen` prop
- When fullscreen, use `preserveAspectRatio="none"` on the SVG and set `width: 100%; height: 100%` so it fills the entire container
- Better approach: use `preserveAspectRatio="xMidYMid meet"` so the chart scales proportionally to fill available space without distortion

### B. Fix fullscreen layout in QuickTradeChart

**File: `src/components/quick-trade/QuickTradeChart.tsx`**
- Pass `fullscreen={true}` to `SimpleCandleChart` and `SimpleAreaChart` when rendering in fullscreen mode
- Remove `flex items-center justify-center` -- instead make the chart fill the container naturally
- Change the inner wrapper from centering to stretching: `w-full h-full` without flex centering
- Ensure the `ChartZoomWrapper` and inner div both use `height: 100%`

### C. Scale chart components in fullscreen

**File: `src/components/quick-trade/SimpleCandleChart.tsx`**
- When `fullscreen` is true, set the SVG container to `height: 100%` instead of `h-[220px]`
- Use CSS `aspect-ratio` or let the SVG fill via `width="100%" height="100%"` with `preserveAspectRatio="xMidYMid meet"`
- This keeps the viewBox coordinates intact but scales the rendered output to fill the screen

**File: `src/components/quick-trade/SimpleAreaChart.tsx`**
- Same fullscreen prop and scaling logic

### D. Improve fullscreen polish
- Add subtle padding (16-24px) around the chart in fullscreen so it doesn't touch edges
- Ensure price labels scale appropriately (slightly larger font in fullscreen)
- Move the timer badge to a more visible position

### Files to modify
1. `src/components/quick-trade/SimpleCandleChart.tsx` -- add `fullscreen` prop, make SVG fill container
2. `src/components/quick-trade/SimpleAreaChart.tsx` -- same fullscreen scaling
3. `src/components/quick-trade/QuickTradeChart.tsx` -- pass `fullscreen` prop, fix layout wrapper

