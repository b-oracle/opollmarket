

## Plan: Separate Registration Bonus vs Referral Commission on Admin Referrals Page

### Current State
- **place-bet** already credits per-trade referral commission to **main balance** (not bonus) and sends a notification — no backend changes needed.
- Registration bonus goes to **bonus_balance** via `referral_rewards` table — correct, stays as-is.
- Per-trade commissions are recorded as transactions with `type='commission'` and `side='referral'`.
- The Admin Referrals page currently only shows data from `referral_rewards` (registration bonuses), with no visibility into ongoing per-trade commissions.

### Changes

**File: `src/pages/admin/AdminReferrals.tsx`**

1. **Fetch referral commission transactions** alongside existing `referral_rewards` data:
   - Query `transactions` table where `type='commission'` AND `side='referral'`, filtered by time range
   - Extract: count, total amount, unique referrers, per-referrer breakdown

2. **Split stat cards into two groups:**

   **Registration Bonus** (from `referral_rewards`):
   | Card | Value |
   |------|-------|
   | Registration Bonuses | count of referral_rewards |
   | Bonus Paid Out | SUM of referral_rewards amounts |
   | Unique Referrers | distinct referrer_ids |
   | Avg Bonus | average reward amount |

   **Referral Commission** (from `transactions` where side='referral'):
   | Card | Value |
   |------|-------|
   | Trade Commissions | count of referral commission txns |
   | Commission Paid Out | SUM of commission amounts |
   | Active Referrers | distinct user_ids earning commissions |
   | Avg Commission | average commission per trade |

3. **Add a tab toggle** between "Registration Bonus" and "Referral Commission" for the history table, so admins can view either set of records.

4. **Top Referrers** section updated to show combined earnings (bonus + commission) with a breakdown label.

No database migrations or edge function changes needed.

### File Changes

| File | Change |
|------|--------|
| `src/pages/admin/AdminReferrals.tsx` | Fetch commission transactions, split stats into two card groups, add tab for history table |

