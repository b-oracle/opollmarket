

## Problem

Bottom-sheet modals (BetModal, DepositWithdrawModal, CommentsDrawer, BoostMarketModal, InstallAppModal, Portfolio sell modal) and the BottomNav all share `z-50`. On mobile devices, the bottom sheets render **behind** the BottomNav and system UI bars. Some sheets have inconsistent bottom padding (ranging from `pb-8` to `pb-24`), causing content to be clipped or hidden.

Additionally, some pages have inconsistent padding for the fixed TopBar and BottomNav.

## Root Causes

1. **Z-index collision**: All bottom-sheet modals and the BottomNav use `z-50`. Modals should layer above the nav.
2. **Inconsistent safe-area padding**: Each modal uses a different bottom padding strategy. Some miss safe-area insets entirely.
3. **No centralized approach**: Each component independently handles spacing, leading to drift.

## Plan

### 1. Elevate modal z-index above BottomNav

All bottom-sheet overlays and panels will use `z-[60]` instead of `z-50`. BottomNav stays at `z-50`. This ensures modals always render above the navigation.

**Files affected:**
- `src/components/BetModal.tsx` -- backdrop and panel: `z-50` to `z-[60]`
- `src/components/DepositWithdrawModal.tsx` -- same
- `src/components/CommentsDrawer.tsx` -- same
- `src/components/BoostMarketModal.tsx` -- same
- `src/components/InstallAppModal.tsx` -- same
- `src/pages/Portfolio.tsx` -- sell modal overlay and panel: same

### 2. Standardize bottom padding on all bottom sheets

All bottom-sheet content containers will use a consistent padding-bottom: `pb-[calc(env(safe-area-inset-bottom)+1.5rem)]` to clear device home indicators and system bars.

**Specific fixes:**
- **BetModal**: Already has `pb-[calc(env(safe-area-inset-bottom)+1rem)]` -- increase to 1.5rem for consistency
- **DepositWithdrawModal**: Replace hardcoded `pb-24` with safe-area calc
- **CommentsDrawer**: Add safe-area bottom padding to the outer container
- **BoostMarketModal**: Add safe-area bottom padding to the content area
- **InstallAppModal**: Replace `pb-10` with safe-area calc
- **Portfolio sell modal**: Replace `pb-8` with safe-area calc

### 3. Verify page-level padding consistency

Pages already use `paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))'` consistently. No changes needed for page layouts -- the issue is specifically the modals/trays.

### Summary of changes

6 files modified, purely CSS class changes (z-index and padding). No logic or structural changes.

