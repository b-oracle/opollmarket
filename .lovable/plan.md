

# Fix: Keep all side actions within viewable screen area

## Problem
The side action column (Like, Comment, Save, Details, Share, and conditionally Boosted) is absolutely positioned at `bottom-2 right-3`. On smaller viewports (e.g. short phones, landscape), the stacked icons can overflow above the visible card area. The card uses a fixed `--feed-card-height` but the side actions don't adapt to fit within it.

## Solution
Make the side actions column responsive to the available card height:

### `src/components/MarketCard.tsx` (Side actions — lines 400-443)
- Change the side actions container from `absolute right-3 bottom-2` with fixed gaps to a **flex column that stretches vertically** within the card and distributes items with `justify-end` and responsive gaps.
- Use smaller icon sizes (`w-8 h-8` instead of `w-9 h-9`) and reduce gaps on short viewports using CSS clamp or responsive classes.
- Add `max-h-[calc(var(--feed-card-height)-4rem)]` to the side column so it never exceeds the card minus padding, with `overflow-hidden` as a safety net.
- Use `gap-[clamp(0.25rem,1.5vh,0.625rem)]` so spacing compresses on short screens.
- Reduce icon button sizes responsively: `w-[clamp(1.75rem,4vh,2.25rem)] h-[clamp(1.75rem,4vh,2.25rem)]` so they scale down on smaller viewports.

### `src/components/MarketCard.tsx` (Content area — line 446)
- The content area (`max-w-[calc(100%-3.5rem)]`) already accounts for the side column width — keep this but ensure it also uses `max-h` constraints so content + buttons don't push below the card.

### Summary of changes
- **1 file**: `src/components/MarketCard.tsx`
  - Side actions container: add max-height constraint, use `clamp()` for responsive gap and icon sizes
  - Ensures all 5-6 action buttons always fit within the visible card area regardless of screen height

