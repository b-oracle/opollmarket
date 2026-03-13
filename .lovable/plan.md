

## Tablet Feed Layout Fix

### Problem
The `.snap-feed` container uses `position: fixed` with `left: 0`, which makes it ignore the parent's `md:ml-60` / `md:ml-[4.5rem]` margin applied by `ConditionalLayout`. On tablet (≥768px), the `DesktopSidebar` is visible but the feed renders behind it.

### Fix

**`src/pages/Feed.tsx`**:
1. Import `useSidebarState` hook to get `collapsed` state
2. On the fixed `.snap-feed` container, change `left: 0` to dynamically account for the sidebar:
   - `left: 0` on mobile (< 768px, no sidebar)
   - `left: '4.5rem'` when sidebar is collapsed (≥ 768px)
   - `left: '15rem'` (240px / w-60) when sidebar is expanded (≥ 768px)
3. Use `useIsMobile()` (breakpoint 768px matches `md:` prefix) to determine whether sidebar offset is needed
4. Apply the same left offset to the empty-bookmarks state container and the watchlist tab handle positioning

### Technical Detail
The sidebar widths are `w-60` (15rem = 240px) expanded and `w-[4.5rem]` (72px) collapsed, matching what `ConditionalLayout` uses. Since the feed container is `position: fixed`, it must manually replicate this offset via its `left` style property. A CSS media query approach via inline style or the existing `useIsMobile` hook will handle the responsive logic.

