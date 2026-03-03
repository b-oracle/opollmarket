

## Plan: Referral-Based Leaderboard

Replace the current mock trader leaderboard with real data from the `referral_rewards` and `profiles` tables. The leaderboard will rank users by referral performance instead of trading PnL.

### Data Source
- Query `referral_rewards` grouped by `referrer_id` to get: total referrals count, total rewards earned
- Join with `profiles` to get display names and avatars
- Keep the "markets" tab as-is (already uses real-ish data)

### Database Change
- Add an RLS policy allowing authenticated users to read aggregated referral data (currently only referrers can see their own rows and admins see all). We need a public SELECT policy on `referral_rewards` so the leaderboard can aggregate across all users.

### UI Changes (`src/pages/Rankings.tsx`)
- Remove all mock trader data
- Fetch real referral leaderboard data from Supabase on mount
- New referrer interface: `name`, `avatar`, `totalReferrals`, `totalEarned`
- Sort options become: "Total Earned", "Referrals Count"
- Podium shows top 3 referrers by selected sort
- List items show: rank badge, avatar/name, referral count, total earned
- Loading state with spinner
- Empty state when no referral data exists
- Tab rename: "referrers" instead of "traders"

### Summary of Changes
1. **Migration**: Add public SELECT policy on `referral_rewards` for leaderboard aggregation
2. **Rankings.tsx**: Full rewrite — fetch from Supabase, display referral-based rankings with real data, loading/empty states

