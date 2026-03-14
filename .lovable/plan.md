## Problem

The "Platform Profit" calculation on the Predictions analytics page (`AdminPredictions.tsx`) is wrong. It currently does: `Total Wagered - Total Payouts - Total Refunds`, which treats all wagered amounts as revenue. In reality:

- **Wagered amounts** are held in escrow — they're neither profit nor loss until resolution (losers pay winners).
- **Actual platform revenue** comes from: admin commission fees + creator exit fees + forfeited creation fees (moderation).
- **Platform costs** are: payouts to winners + refunds on cancellations + liquidity returns to creators.

The current formula double-counts by treating wagers as income.

## Correct Financial Model

Based on the codebase (`place-bet`, `resolve-market`, `cancel-market`):

1. **Admin Commission** — `admin_fee_percent` of each prediction amount (type=`commission`, user=admin)
2. **Creator Commission** — `creator_fee_percent` of each prediction amount (type=`commission`, user=creator)
3. **Initial Liquidity** — creators deposit liquidity (type=`buy`, side=`initial_liquidity`)
4. **Creation Fee** — paid by creators (type=`buy`, side=`market_creation_fee`)
5. **Liquidity Exit Fee** — retained by platform on resolution (liquidity × exit_fee_percent)
6. **Winner Payouts** — type=`payout`
7. **Refunds** — type=`refund` (cancellations, liquidity returns with side=`liquidity_return`)
8. **Fee Forfeitures** — type=`fee_forfeiture` (moderation rejects)
9. Market boost - when anybody pays to boost any market
10. AI fees - when a user generates description and more details 

**True Platform Profit** = Total Admin Commissions + Liquidity Exit Fees + boosts + AI fees + Forfeited Creation Fees + (Pool from markets where everyone lost and no payouts were made)

## Plan

### 1. Revamp AdminPredictions analytics cards

Replace the current 6 cards with more meaningful metrics:

- **Total Markets** (unchanged)
- **Total Predictions** (unchanged, renamed from "Total Bets")
- **Unique Traders** (unchanged)
- **Total Wagered** — sum of `buy` transactions excluding `initial_liquidity` and `market_creation_fee` sides
- **Total Liquidity Added** — sum of `buy` transactions where side=`initial_liquidity`
- **Admin Commissions** — sum of `commission` transactions where user is admin (or derive from buy amount × fee%)
- **Creator Commissions** — sum of `commission` transactions where user is NOT admin
- **Total Payouts** (unchanged)
- **Total Refunds** (unchanged)
- **Platform Profit** — Admin Commissions + Creation Fees retained (forfeited) + Liquidity Exit Fees — recalculated correctly

To compute this accurately, the data fetch will also need to pull `commission` and `fee_forfeiture` type transactions, and distinguish `buy` transactions by their `side` field.

**Implementation details:**

- Expand the transaction fetch to also include `initial_liquidity` and `market_creation_fee` sides, plus `fee_forfeiture` type
- Filter `buy` transactions: separate pure predictions (side = yes/no/option) from liquidity (side=`initial_liquidity`) and creation fees (side=`market_creation_fee`)
- Compute admin commissions from `commission` type transactions
- Compute creator commissions separately (commission tx where user ≠ admin)
- Reorganize cards into 2 rows: top row = counts, bottom row = financials
- Add a small info tooltip explaining the profit formula

### 2. Update the "Top Traders" label

Change "bets" to "predictions" in the top traders section (line 320: `{t.bets} bets`).

### 3. Portfolio page — no changes needed

The user Portfolio page already correctly shows individual position P&L based on shares × price. Transaction history already labels types correctly. No changes required.

### Files to modify

- `src/pages/admin/AdminPredictions.tsx` — main changes (cards, data fetch, calculations)