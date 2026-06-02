## Goal
Prevent users from selling their position once a market is within 1 hour of its `end_date`. They'll need to hold until resolution.

## Changes

### 1. Server-side guard (authoritative)
**`supabase/functions/sell-position/index.ts`**
- Include `end_date` in the `markets` select.
- After the `status !== "active"` check, add:
  - If `end_date` exists and `new Date(end_date).getTime() - Date.now() <= 60 * 60 * 1000` → return `400` with error `"Selling is locked within the final hour before market close. Hold until resolution."`
- This is the source of truth — any client bypass still fails.

### 2. UI affordance
**`src/pages/Portfolio.tsx`**
- Add a helper `isSellLocked(endDate)` → true when within 1h of end.
- Where the Sell button is rendered for each active position:
  - Disable the button when `isSellLocked(pos.endDate)` is true.
  - Show a small label like "Locked · closes soon" (using muted-foreground / destructive token) under or in place of the action.
- In `openSell`, early-return with a toast `"Selling is locked in the final hour before close."` as a defensive fallback.

### 3. Scope notes
- Only affects manual sells. Limit-order matching, resolution payouts, and refunds are untouched.
- Threshold is a single constant `SELL_LOCK_MS = 60 * 60 * 1000` in both the edge function and the page, so it can be tuned later.

## Out of scope
- No DB migration; the rule is purely a time check against existing `markets.end_date`.
- No change to UpDown/crypto rounds (they don't go through sell-position).
