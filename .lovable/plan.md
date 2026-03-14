

## Plan: Fix User Activity Drawer Data & Add Per-User Summary Cards

### Problem: Data Not Populating

The network requests show the transactions query returning `[]` despite data existing in the database. The root cause is **RLS policies**: several tables (`transactions`, `positions`, `quick_bets`, `withdrawal_requests`, `referral_rewards`) only grant admin read access via `has_role(auth.uid(), 'admin')`, but do NOT include `super_admin`. Since the "View Activities" button is only shown to super admins, a super_admin who also has the `admin` role works — but this is fragile. More importantly, if the user's session isn't active in the preview, `auth.uid()` returns null and everything is blocked.

**Fix**: Add `super_admin` SELECT policies to all tables queried by the drawer. This ensures super_admins can always read the data regardless of whether they also hold the `admin` role.

Tables needing an additional `super_admin` SELECT policy:
- `transactions`
- `positions`
- `quick_bets`
- `bookmarks` (already has broad `true` policy for authenticated, OK)
- `referral_rewards`
- `withdrawal_requests`
- `comments` (already public readable, OK)

### Feature: Per-User Summary Cards

Add a summary stats section at the top of the drawer content area (below tabs, above transaction list) showing 5 cards:

| Card | Source | Color |
|------|--------|-------|
| Total Deposited | SUM of `deposit` + `confirmed` transactions for this user | default |
| Total Withdrawn | SUM of `withdrawal` + `confirmed` transactions for this user | default |
| Total Balance | From `balances` table for this user | default |
| Total Wins | Prediction payouts + QT wins + referral rewards + copy trade commissions | green |
| Total Losses | (Buy wagers - payouts - refunds) + QT losses | red |

**Implementation**: Fetch these stats when the drawer opens alongside the tab data. Display as a compact grid of 5 cards at the top of the scrollable content area, visible on all tabs.

### Changes

| File | Change |
|------|--------|
| DB Migration | Add `super_admin` SELECT policies to `transactions`, `positions`, `quick_bets`, `referral_rewards`, `withdrawal_requests` |
| `UserActivityDrawer.tsx` | Add per-user financial summary cards fetched on open; display above tab content |

