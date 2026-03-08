

## Fix: Trays and Market Cards Sit Above Bottom Nav Bar

### Problem
From the screenshot and code inspection:
1. **Bottom sheets/trays** (BetModal, CommentsDrawer, DepositWithdrawModal, etc.) are positioned at `fixed bottom-0` and use inner `paddingBottom` to compensate for the nav bar. This causes them to float behind/over the nav rather than sitting flush above it.
2. **Feed market cards** use height `calc(100dvh - 3.5rem - env(safe-area-inset-top))` which doesn't account for the bottom nav bar height (~4rem + safe-area-inset-bottom), so cards extend behind the nav bar instead of snapping to the space above it.

### Plan

#### 1. Fix BottomSheet to sit above the nav bar
**File: `src/components/BottomSheet.tsx`**
- Change the panel's `bottom` position from `0` to sit above the bottom nav on mobile: `bottom: calc(4rem + env(safe-area-inset-bottom))`
- Remove the internal `paddingBottom: calc(env(safe-area-inset-bottom) + 5.5rem)` since the tray itself will be positioned above the nav
- Keep `bottom-0` on desktop (md+) where there is no bottom nav

#### 2. Fix Feed card height to account for bottom nav
**File: `src/pages/Feed.tsx`**
- Update the snap-feed container height from `calc(100dvh - 3.5rem - env(safe-area-inset-top))` to also subtract the bottom nav height: `calc(100dvh - 3.5rem - env(safe-area-inset-top) - 4rem - env(safe-area-inset-bottom))`
- Update the `--feed-card-height` CSS variable accordingly
- On desktop (where no bottom nav), the full height should remain as-is — handle via the existing `useIsMobile` or media queries

#### 3. Update MarketCard fallback height
**File: `src/components/MarketCard.tsx`**
- Update the fallback in the `var(--feed-card-height, ...)` to match the new calculation including bottom nav offset

### Files Changed
- `src/components/BottomSheet.tsx` — reposition panel above nav bar
- `src/pages/Feed.tsx` — fix snap container height
- `src/components/MarketCard.tsx` — update fallback card height

