

## Fix: Tablet Feed — Hidden Side Icons and Off-Center BetModal

### Problems Identified

**1. BetModal (BottomSheet) not centered on tablet**
In `src/components/BottomSheet.tsx` line 34, the panel has `md:left-60` hardcoded. This assumes the sidebar is always expanded (15rem/240px). When the sidebar is collapsed (4.5rem/72px), the modal's left offset is wrong, pushing it off-center. The modal also lacks a matching `md:right-0` to properly constrain its centering calculation.

**2. Side action icons clipped on tablet**
The `.snap-feed` container uses `overflow-y: scroll`. Due to CSS spec behavior, setting overflow to scroll/auto on one axis forces the other axis to `auto` as well (not `visible`). This means the container clips horizontal content too. At 768px with the sidebar taking space, the cards fill the full container width, and the side icons at `absolute right-3` inside the card should technically fit — but the `max-w-3xl mx-auto` on the fixed container can interact oddly with the fixed positioning. The real fix is ensuring the container never clips horizontally by adding `overflow-x: visible` won't work with scroll on Y, so we need to ensure card content including side icons stays within bounds. The actual clipping likely comes from the card's own width not accounting for the narrower tablet space properly.

### Plan

**File: `src/components/BottomSheet.tsx`**
- Remove the hardcoded `md:left-60` class
- Make the panel dynamically aware of sidebar state by accepting an optional `sidebarOffset` prop, or by importing `useSidebarState` and `useIsMobile` directly
- Set `left` to `0` on mobile, `4.5rem` when sidebar collapsed, `15rem` when expanded (same logic as Feed.tsx)
- Keep `right: 0` and `max-w-lg mx-auto` so centering works within the available content area

**File: `src/components/MarketCard.tsx`**
- The side action icons container at line 400 uses `absolute right-3`. This is fine positioning-wise, but the card itself at line 242 has no `overflow-hidden` — good. The issue is the parent snap-feed container's implicit `overflow-x: auto`. 
- Add `overflow-x: clip` to the snap-feed CSS (which allows visible positioning within bounds but prevents scrollbar) or ensure the card constrains its side icons within its padded area.
- Actually the simpler fix: ensure the snap-feed container on the fixed positioning doesn't use `max-w-3xl` (which is 768px — the same as the tablet breakpoint), as this can cause the centering logic to fight with the fixed left/right anchors. Remove `max-w-3xl mx-auto` from the snap-feed container on tablet — the fixed left/right already constrain width. This ensures cards and their absolutely-positioned icons have the full available width.

### Summary of Changes

| File | Change |
|------|--------|
| `src/components/BottomSheet.tsx` | Import sidebar state hooks; dynamically set `left` based on sidebar collapsed/expanded state instead of hardcoded `md:left-60` |
| `src/pages/Feed.tsx` | Remove `max-w-3xl mx-auto` from the snap-feed container (the fixed left/right already constrain width correctly) |

### Risk Assessment
- **BottomSheet.tsx**: Used by BetModal and potentially other modals. The sidebar-aware offset ensures it centers in the content area on all screen sizes. Mobile behavior unchanged (left: 0).
- **Feed.tsx**: Removing `max-w-3xl` from the fixed container means cards span the full content width on large screens. Cards themselves have their own max-width via content layout, so visual impact is minimal. On very wide screens, cards will use full width — if this is undesired, we can move `max-w-3xl` to individual card wrappers instead.

