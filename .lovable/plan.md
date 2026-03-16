

## Plan: Fix Referral Leaderboard Metrics

### Problem
Currently `useReferralLeaderboard` only queries `referral_rewards`. This means:
- **Total Earned** only includes registration bonuses, missing referral prediction commissions
- **Referrals count** shows count of rewarded referrals (first-prediction bonuses), not actual signup count

### Changes (single file: `src/pages/Rankings.tsx`)

**Update `useReferralLeaderboard` hook (lines 177-224):**

1. **Total Earned** — fetch both `referral_rewards` and commission transactions (`transactions` where `type='commission'`, `side='referral'`, `status='confirmed'`) in parallel, then sum both per referrer.

2. **Total Referrals count** — fetch `profiles` where `referred_by` is not null, group by `referred_by` to get actual signup counts per referrer. This replaces the current count which only counts rewarded referrals.

3. Merge all three data sources (bonus rewards, commissions, profile referral counts) into the `Referrer` objects.

**Update Referrals tab rendering (lines 872-978):**

4. When sorted by "Referrals", show the referral count as the primary metric (e.g., "12 referrals") with a Users icon instead of dollar amounts. The podium `valueLabel` should switch based on `referralSort`.

5. When sorted by "Total Earned", keep current dollar display.

### Technical Detail
- The profiles query uses `referred_by` to count all signups (not just those who placed first prediction)
- Commission transactions are filtered: `type='commission'`, `side='referral'`, `status='confirmed'`
- Both queries respect the time period cutoff
- All user IDs from all three sources are collected for profile lookups

