

# Fix PnL Card to Not Count Open Wagers as Losses

## Problem
When a user places a prediction (e.g. $10), the PnL card immediately shows -$10 because the formula subtracts `totalBought` (all wager amounts) from `totalPayouts` (resolved winnings). Open/unresolved wagers should not count as losses.

## Current Formula (Profile.tsx, line 1552)
```
pnl = totalPayouts + totalSold - totalBought + unrealizedPnl + qtPnl
```
This double-counts open positions: they appear as a negative via `-totalBought` AND as unrealized P&L. Only the price movement from entry should matter for open positions, not the wager itself.

## Fix

### File: `src/pages/Profile.tsx` (~line 1524-1552)

Split wagers into **resolved** and **open**, and only count resolved wagers as costs:

1. Get all market IDs from active open positions (shares > 0, market status = "active")
2. Separate `predictionBuyTxns` into:
   - **Resolved wagers**: buy transactions for markets where the user has NO open position (market resolved/ended, or position closed via sell)
   - **Open wagers**: buy transactions for markets where the user still holds an open position
3. New formula:
   ```
   pnl = totalPayouts + totalSold - resolvedBought + unrealizedPnl + qtPnl
   ```
   Where `resolvedBought` only includes wagers on markets that have been resolved/settled, not open positions. The `unrealizedPnl` already captures the current value change of open positions relative to entry price.

4. Update the tooltip text to reflect the new logic: "Settled payouts − settled wagers + unrealized P&L from open positions + Quick Trade P&L"

### Why this works
- Fresh prediction: `resolvedBought` = 0, `unrealizedPnl` ≈ 0 → PnL stays near 0
- Price moves up: `unrealizedPnl` goes positive → PnL shows gain
- Market resolves as win: payout appears in `totalPayouts`, wager moves to `resolvedBought` → net positive
- Market resolves as loss: no payout, wager in `resolvedBought` → net negative

This affects only the Profile page PnL card. The Portfolio page already correctly shows "Unrealized P&L" (price movement only, no wager subtraction).

