

## Plan: Enhance Analytics Page with Quick Trade Data

### Current State
The analytics page only uses the `analytics_events` table for all metrics. It tracks prediction-related events but has no Quick Trade metrics. The "Bets Confirmed" card counts `bet_confirmed` events only.

### Changes

**1. Add Quick Trade stats via direct DB queries** (not just analytics events)

Fetch from `quick_bets` and `transactions` tables within the selected time range:
- **Quick Trade count** (total QT rounds in period)
- **QT Volume** (sum of amounts wagered)
- **QT Win Rate** (won / (won + lost))
- **QT P&L** (total payouts - total wagers for won+lost)
- **Prediction Volume** (sum of `buy` transactions with `market_id`)
- **Total Deposits / Withdrawals** in period

**2. Rename & expand top stat cards** from 4 to 6-8 cards:

| Card | Source |
|------|--------|
| Total Events | analytics_events count (unchanged) |
| Active Users | unique user_ids from events (unchanged) |
| Total Trades | prediction `bet_confirmed` events + quick_bets count combined |
| Predictions | count of `bet_confirmed` events |
| Quick Trades | count from `quick_bets` table |
| QT Win Rate | won/(won+lost) from `quick_bets` |
| Prediction Volume | SUM buy transactions with market_id |
| QT Volume | SUM quick_bets amounts |

**3. Add Quick Trade section** below popular markets:
- A new card with 4 sub-stat cards: QT Volume, QT Wagered, QT Payouts, QT Win Rate
- A daily QT activity chart (trades per day, wins vs losses) using an AreaChart
- Top QT assets breakdown (group quick_bets by round→asset)

**4. Add Revenue Overview section:**
- Total Deposits vs Withdrawals in the period
- Net platform revenue (deposits - withdrawals - payouts)
- Daily deposit/withdrawal trend chart

### Data Fetching
All new queries run in parallel inside the existing `fetchAll` useEffect, filtered by `sinceISO`. Uses paginated fetches for `quick_bets` and `transactions` (same pattern already used).

### File Changes

| File | Change |
|------|--------|
| `src/pages/admin/AdminAnalytics.tsx` | Add QT + revenue state, fetch QT data from `quick_bets` and `transactions`, rename "Bets Confirmed" to "Total Trades", add QT section with stats + chart, add revenue overview section |

No database migrations needed — all tables already have admin SELECT RLS policies.

