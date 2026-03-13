

# Fix: Side actions staying in view + smooth sidebar transitions

## Problem
1. **Side actions overflow**: The Like, Save, Comment, Details, Share buttons can extend beyond the visible card area on smaller screens
2. **Content shifts on sidebar toggle**: When the desktop sidebar opens/closes, the feed container jumps instantly (no transition) and content can shift outside the viewable area instead of smoothly compressing

## Changes

### 1. `src/pages/Feed.tsx` — Add smooth transition to feed container
- Add `transition: 'left 0.3s ease'` to the fixed feed container's inline style (line ~434) so opening/closing the sidebar smoothly animates the content area instead of jarring shifts
- Apply the same transition to the empty bookmarks state container (line ~417)

### 2. `src/components/MarketCard.tsx` — Make side actions fully responsive
- **Side actions container** (line 400): Replace `max-h-[calc(var(--feed-card-height,100vh)-4rem)]` with a tighter constraint: `max-h-[calc(var(--feed-card-height,100vh)-6rem)]` and add `justify-between` so items distribute evenly within available space
- **Icon sizes**: Reduce clamp minimums from `1.75rem` to `1.5rem` → `w-[clamp(1.5rem,3.5vh,2.25rem)] h-[clamp(1.5rem,3.5vh,2.25rem)]`
- **Gap**: Tighten clamp: `gap-[clamp(0.125rem,1vh,0.5rem)]`
- **Labels**: Make the text labels (`text-[9px]`) conditionally hidden on very short viewports by adding a `min-h-0` wrapper with `overflow-hidden` on each action group, and reduce label line-height further
- **Content area** (line 446): Keep `max-w-[calc(100%-3.5rem)]` so content doesn't overlap the side column

### 3. `src/components/TopBar.tsx` — Smooth sidebar transition
- The TopBar already uses `md:left-[4.5rem]` / `md:left-60` based on sidebar state. It has `transition-all duration-300` which covers this. No change needed.

### Summary
- **2 files**: `Feed.tsx` (add transition), `MarketCard.tsx` (tighter responsive constraints on side actions)
- Content will smoothly compress/expand when sidebar toggles instead of shifting
- Side action buttons will scale down more aggressively on short viewports to always fit

