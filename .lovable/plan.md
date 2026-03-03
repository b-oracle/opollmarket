

## Plan: Add Boost Status Indicator to Market Detail Page

### Current State
- Feed cards and Index list cards already show boost tier badges and countdown timers via `BoostCountdown`
- The **MarketDetail page** has no boost indicator — it imports `useMarket` but not `useActiveBoosts`

### Changes

#### 1. `src/pages/MarketDetail.tsx`
- Import `useActiveBoosts` and `BoostCountdown`
- Call `useActiveBoosts()` to get `boostedMarketIds` and `boostDetails`
- Add a boost status banner below the image banner (or below the title if no image), showing:
  - Tier-colored badge (Flash/Standard/Whale) with icon
  - Live countdown via `BoostCountdown` (full, non-compact mode)
  - Only renders when the market has an active boost

This is the only file that needs changes. The `BoostCountdown` component already handles tier-specific icons, colors, labels, and countdown formatting.

