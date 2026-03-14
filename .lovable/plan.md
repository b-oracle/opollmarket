

## Current Quick Trade Analytics -- How It Works

The admin Quick Trade page (`AdminQuickTrade.tsx`) currently calculates **Platform Profit** the same wrong way as Predictions was doing:

```
Platform Profit = Total Wagered - Total Payouts
```

This is **incorrect** for the same reason: wagered amounts are escrowed (losers pay winners). The platform only earns the **fee** taken from the winning pool, not the full difference between wagered and paid out.

### Current cards (6):
1. Total Rounds
2. Total Trades
3. Unique Traders
4. Total Wagered
5. Total Payouts
6. Platform Profit (wrong formula)

## How Quick Trade Fees Actually Work

From `resolve-quick-round/index.ts`:

- When there are **both winners and losers**: losers' pool is taxed by `platformFee` (default 5% via `quick_trade_fee_percent`). Winners get their stake back + their share of `losersPool * (1 - platformFee)`, optionally with streak multiplier.
- When **only winners** (no losers): winners get back `amount * (1 - platformFee)` -- the platform keeps the fee.
- When **only losers** (no winners): losers get $0 payout. The platform keeps **everything** wagered by losers.
- **Flat** (no price change): full refund, no fee.

So **true platform revenue** = `Total Wagered - Total Payouts - Total Refunds`. Wait -- that's actually the same formula but it IS correct for Quick Trade because there are no separate commission transactions. The fee is implicit (baked into the payout calculation). Let me re-examine...

Actually, looking more carefully: the current formula `totalWagered - totalPayout` is **correct for Quick Trade** because:
- Every dollar wagered either becomes a payout, a refund, or platform revenue
- There are no separate commission/fee transaction records -- fees are deducted inline from payouts
- Refunded trades have `payout = amount` and `status = 'refunded'`

**But** the current code only sums payouts for `status === "won"` and ignores refunds. So refunded amounts are counted as profit when they shouldn't be.

### The Bug
Line 105: `totalPayout` only includes `status === "won"` payouts. Refunded trades (where `payout = amount`) are excluded, inflating profit.

## Revamp Plan

### Fix the profit calculation
```
totalRefunded = sum of payout where status === "refunded"
platformProfit = totalWagered - totalPayout(won) - totalRefunded
```

### Add more meaningful cards (8 total, 2 rows of 4):

**Row 1 -- Counts:**
1. Total Rounds
2. Total Trades  
3. Unique Traders
4. Resolved Rounds (already computed but not shown)

**Row 2 -- Financials:**
5. Total Wagered
6. Total Payouts (winners)
7. Total Refunded (flat/cancelled)
8. Platform Profit (corrected: wagered - payouts - refunds)

Add a tooltip on Platform Profit explaining: "Fees retained from winning pools + full amount from rounds with no winners"

### File to modify
- `src/pages/admin/AdminQuickTrade.tsx`

