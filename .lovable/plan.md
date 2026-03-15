

## Problem

The area chart line extends to x=100 in the SVG viewBox, but the price labels are positioned in the rightmost ~12% of the container. This causes the line and area fill to draw underneath (and overlap with) the price axis labels.

## Fix

**File: `src/components/quick-trade/SimpleAreaChart.tsx`**

1. **Constrain line X-coordinates to 88%** — change the point calculation from `(i / (n - 1)) * 100` to `(i / (n - 1)) * 88`, matching the grid lines that already stop at x=88.

2. **Fix area polygon** — update the area fill closing points from `100,100 0,100` to `88,100 0,100` so the gradient fill doesn't bleed into the price label gutter.

3. **Fix current price dotted line** — adjust the connecting line from the last data point to the price badge so it starts at x≈88 instead of x=90.

4. **Fix entry price line** — constrain its x2 from 100 to 88.

This matches the existing pattern used by the grid lines (`x2={88}`) and the `SimpleCandleChart` which already constrains candles to ~85% width.

