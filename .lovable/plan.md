

## Plan: Add Infinite Scroll to Market Feeds

### Current State
Both `Index.tsx` (Home grid) and `Feed.tsx` (TikTok swipe feed) render ALL markets at once from `useMarkets()`. No pagination or lazy loading exists.

### Approach
Since `useMarkets()` already fetches all markets in one query, this will be **client-side infinite scroll** — start by showing a batch (e.g. 20), then load more as the user scrolls near the bottom using an `IntersectionObserver` sentinel element.

### Changes

#### 1. `src/pages/Index.tsx` — Home page grid
- Add `visibleCount` state starting at 20
- Slice `filteredMarkets` to `visibleCount`
- Add a sentinel `<div>` after the grid observed by `IntersectionObserver`
- When sentinel enters viewport, increase `visibleCount` by 20
- Reset `visibleCount` when filters/search change
- Show a small spinner while more items are available

#### 2. `src/pages/Feed.tsx` — TikTok snap feed (mobile) + desktop grid
- Same pattern: `visibleCount` state, slice `sortedMarkets`
- Sentinel div at the bottom of the feed container
- On the desktop grid view, same IntersectionObserver approach
- On mobile snap view, load more when `activeIndex` approaches `visibleCount`
- Remove the "Nothing more to see" toast when there are still unloaded items

#### 3. No backend changes needed
All data is already fetched; this is purely a rendering optimization.

### Files changed
| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Add infinite scroll with IntersectionObserver + visibleCount |
| `src/pages/Feed.tsx` | Same pattern for both mobile snap and desktop grid views |

