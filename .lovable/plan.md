

# Fix: Side actions not showing + dark mask on tablet/desktop feed

## Root Cause

Two issues are causing the "dark mask" with hidden side actions:

1. **Sidebar offset mismatch**: The Feed container calculates `sidebarLeft` using `isMobile` (breakpoint 768px), but the `DesktopSidebar` also appears at `md:` (768px). At tablet widths (768-1023px), the sidebar is visible AND the feed applies a `left` offset, but the `ConditionalLayout` wrapper ALSO applies `md:ml-60` or `md:ml-[4.5rem]` — causing the feed to be double-offset and clipped.

2. **Feed sits inside ConditionalLayout**: The Feed's fixed-position container has `left: sidebarLeft`, but it's also inside `ConditionalLayout` which adds `md:ml-60`. Since the Feed container uses `position: fixed`, the parent's margin doesn't affect its position, but the TopBar and BottomNav (which use the layout's margin) are misaligned with the feed content. This creates the visual "dark mask" where content is pushed off-screen.

3. **User wants mobile layout on tablets**: The sidebar should NOT affect the feed layout until desktop widths (1024px+).

## Changes

### 1. `src/pages/Feed.tsx` — Use 1024px breakpoint for sidebar offset
- Change `sidebarLeft` logic: Instead of using `isMobile` (768px breakpoint), use the existing `isDesktop` hook (1024px breakpoint) to determine when to apply sidebar offsets
- When `!isDesktop`, set `sidebarLeft = 0` (mobile/tablet gets full-width feed)
- When `isDesktop`, apply the sidebar offset based on `collapsed` state
- This ensures the feed uses full-width mobile layout on tablets

### 2. `src/pages/Feed.tsx` — Fix empty bookmarks state margin
- Apply the same 1024px breakpoint logic to the empty bookmarks state container's `marginLeft`

### 3. `src/components/MarketCard.tsx` — Ensure side actions are always visible
- The side actions container currently uses `z-10` which may be below the gradient overlay. Increase to `z-20` to ensure it renders above the background gradients and the "ended" overlay (`z-10`)
- The background gradient overlay at line 296 creates a heavy dark mask (`from-background from-10% via-background/80 via-40%`). Reduce opacity slightly so content behind is more visible, but this is secondary to the z-index fix

### Summary
- **2 files**: `Feed.tsx` (sidebar offset breakpoint), `MarketCard.tsx` (z-index fix for side actions)
- Side actions will always render above background overlays
- Tablets will use full-width mobile feed layout without sidebar interference

