

## Add Predictions Analytics Dashboard to Admin Panel

### What exists now
- **AdminQuickTrade** (`/admin/quick-trade`): Full analytics with stat cards (rounds, bets, traders, wagered, payouts, platform profit), daily volume chart, asset pie chart, win/loss distribution, top traders, and paginated rounds/bets tables.
- **AdminAnalytics** (`/admin/analytics`): Event-based analytics + Polymarket fee breakdown. No prediction-specific revenue dashboard.
- There is no dedicated page showing prediction market revenue (total wagered, payouts, platform fees, profit).

### Plan

**Create `src/pages/admin/AdminPredictions.tsx`** — a new admin page mirroring the Quick Trade dashboard structure but for prediction markets. It will:

1. **Fetch data**: Pull from `transactions` table (types: `buy`, `sell`, `payout`, `refund`, `commission`) and `markets` table, with the same paginated fetch pattern used in AdminQuickTrade.

2. **Stat cards** (6 cards):
   - Total Markets (count of all markets)
   - Total Bets (count of `buy` transactions)
   - Unique Traders (distinct user_ids from buy transactions)
   - Total Wagered (sum of `buy` amounts)
   - Total Payouts (sum of `payout` amounts)
   - Platform Profit (wagered − payouts − refunds, or sum of `commission` amounts)

3. **Overview tab**:
   - Daily volume & bets area chart (same style as QT)
   - Category pie chart (markets by category)
   - Win/Loss: resolved markets where user won vs lost
   - Top traders by profit (payout − wagered per user)

4. **Markets tab**: Paginated table of markets with volume, participants, status, category, created date.

5. **Bets tab**: Paginated table of buy/sell transactions with user, market, side, amount, shares, price, date.

6. **Time range filter**: 7D / 30D / All (same as QT).

**Update `src/pages/admin/AdminLayout.tsx`**:
- Add nav item: `{ to: "/admin/predictions", label: "Predictions", icon: TrendingUp, roles: ["super_admin", "admin"] }`

**Update `src/App.tsx`**:
- Add route for `/admin/predictions` pointing to the new component.

### No database or backend changes needed — all data comes from existing `transactions` and `markets` tables.

