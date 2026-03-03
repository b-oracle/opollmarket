

## Problem

The BottomSheet's `paddingBottom` only accounts for safe-area insets (`env(safe-area-inset-bottom) + 1.5rem`), but doesn't account for the ~64px BottomNav bar. This means the last content (confirmation buttons, slide-to-confirm) gets hidden behind the nav bar on pages where BottomNav is visible (Feed, Home, etc.). On MarketDetail, the nav may not be as prominent, which is why it looks fine there.

Additionally, `BoostMarketModal` still uses its own custom modal markup instead of the shared `BottomSheet` wrapper.

## Plan

### 1. Fix BottomSheet padding to clear the BottomNav

Update the `paddingBottom` in `BottomSheet.tsx` to add enough space for the bottom nav bar (~4rem/64px) on top of the safe-area inset:

```
paddingBottom: "calc(env(safe-area-inset-bottom) + 5.5rem)"
```

This ensures all content clears the nav bar across all pages.

### 2. Refactor BoostMarketModal to use BottomSheet

Replace the custom `AnimatePresence` + `motion.div` wrapper in `BoostMarketModal.tsx` with the `<BottomSheet>` component, matching the pattern used by BetModal, DepositWithdrawModal, CommentsDrawer, and InstallAppModal. Move the inner content (header, tier selection, payment, success) as children of `<BottomSheet>`.

### Files to change
- `src/components/BottomSheet.tsx` — increase bottom padding
- `src/components/BoostMarketModal.tsx` — refactor to use `<BottomSheet>`

