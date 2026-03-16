

## Problem

The **Dashboard "Total Volume"** and **Analytics "Prediction Vol"** show different numbers because they measure different things:

| Card | Source | Scope |
|------|--------|-------|
| Dashboard → Total Volume | `SUM(markets.volume)` | All-time, all markets |
| Analytics → Prediction Vol | `SUM(transactions.amount) WHERE type='buy'` | Time-filtered (7/14/30 days) |

Additionally, `markets.volume` is incremented by the **full bet amount** (before fees) in `place-bet`, while `transactions.amount` for type `buy` is also the full `totalCost`. So they *should* match when looking at the same time window — but the analytics page applies a time filter and the dashboard does not.

There's also a subtle discrepancy: `markets.volume` gets incremented by `amount` (the gross bet), but the transaction record also stores `amount: totalCost` which equals the same gross bet. So the per-trade values align.

## Fix

Make both pages consistent by aligning their definitions:

### 1. Analytics page — add an all-time prediction volume card
Add a separate query in `AdminAnalytics.tsx` that sums `markets.volume` (all markets, no time filter) using the same batch-fetch pattern from the dashboard, and display it as "Total Prediction Volume (All-Time)" alongside the existing time-filtered "Prediction Vol".

### 2. Dashboard — clarify label
Rename the Dashboard card from "Total Volume" to "All-Time Volume" to make it clear this is not time-filtered.

### 3. Alternative: make Dashboard volume also time-filterable
If the preferred behavior is that both should match, instead change the Dashboard's volume calculation to also sum from `transactions` where `type='buy'` (matching the analytics approach) but without time filter. This would ensure both use the same data source. However since `markets.volume` already represents this and is cheaper to query, the simplest fix is just labeling clearly and ensuring Analytics also shows the all-time figure.

**Recommended approach**: Rename Dashboard label to "All-Time Volume" and add an all-time volume summary in Analytics so admins can cross-reference. Both will use `SUM(markets.volume)` for the all-time number.

