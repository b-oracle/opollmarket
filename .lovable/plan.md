

## Problem

The user "cultivator400@gmail.com" shows -$506 PNL because **initial liquidity** ($400) and **broadcast fees** ($5) are stored as transaction type `buy` with special `side` values (`initial_liquidity`, `broadcast_fee`). Every PNL calculation in the system treats ALL `buy` transactions as wagers/losses, inflating the user's apparent losses.

### Affected locations

1. **`get_prediction_leaderboard` RPC** — PNL = `payouts + refunds - SUM(buy amounts)`. Includes initial_liquidity and broadcast_fee buys.
2. **`get_admin_user_stats` RPC** — `total_losses` uses all `buy` transactions with a `market_id`.
3. **`UserActivityDrawer.tsx`** — Admin user stats: `buys = all type='buy'` transactions.
4. **`balance-reconciliation` edge function** — counts `buy` as debit (this is correct for balance math, but the PNL display is wrong).
5. **Portfolio page (`Portfolio.tsx`)** — Uses positions table, so not affected (positions are only created for actual predictions).

### Root cause

Initial liquidity and broadcast fees use `type = 'buy'` but they are NOT prediction wagers. They should be excluded from PNL/wager calculations.

## Plan

### 1. Update `get_prediction_leaderboard` RPC (database migration)

Add a filter to exclude non-prediction buys by checking the `side` column:
```sql
-- Change: WHERE t.type = 'buy' 
-- To:     WHERE t.type = 'buy' AND t.side IN ('yes', 'no')
```

This ensures only actual prediction wagers (side = 'yes' or 'no') are counted. Initial liquidity (`side = 'initial_liquidity'`) and broadcast fees (`side = 'broadcast_fee'`) are excluded.

### 2. Update `get_admin_user_stats` RPC (database migration)

Same fix — filter `buy` transactions to only count `side IN ('yes', 'no')` for the `total_losses` calculation.

### 3. Update `UserActivityDrawer.tsx`

When calculating `buys` for the admin user stats, filter out transactions where `side` is `initial_liquidity` or `broadcast_fee`:
```ts
const buys = txns
  .filter(t => t.type === "buy" && t.amount && t.side !== "initial_liquidity" && t.side !== "broadcast_fee")
  .reduce((s, t) => s + Number(t.amount), 0);
```

### 4. Update `balance-reconciliation` edge function

The reconciliation correctly tracks balance changes (initial_liquidity IS a debit from the user's balance), so no change needed there. But if there's a separate "PNL" display in reconciliation, it would need the same fix. Currently it only compares expected vs actual balance, so it's fine.

### Summary

Two database migrations (recreate `get_prediction_leaderboard` and `get_admin_user_stats` with the `side IN ('yes','no')` filter on buy transactions) and one frontend fix in `UserActivityDrawer.tsx`. This ensures initial liquidity and broadcast fees are treated as operational costs, not prediction wagers, across all PNL calculations.

