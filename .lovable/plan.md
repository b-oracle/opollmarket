

## Plan: Replace "Likes" with "Trades" on User Profile

**What changes:**
The "Likes" stat on the social profile page (`/user/:id`) will be replaced with "Trades" — showing the total count of prediction market trades + quick trades a user has made.

### Changes

1. **`src/pages/UserProfile.tsx`**
   - Replace the `likesCount` query: instead of querying `market_likes`, run two parallel count queries:
     - `transactions` table: count rows where `user_id = id`, `type = 'buy'`, `status = 'confirmed'`
     - `quick_bets` table: count rows where `user_id = id`
   - Rename variable to `tradesCount` (sum of both counts)
   - Update the stat display label from "Likes" to "Trades"
   - Update the `ProfileShareCard` prop from `likesCount` to `tradesCount`

2. **`src/components/ProfileShareCard.tsx`**
   - Rename the `likesCount` prop to `tradesCount`
   - Update the stats grid label from "Likes" to "Trades"

**Note:** The `quick_bets` table has an RLS policy allowing users to read only their own bets, but admins can read all. For non-own profiles, the count query may return 0 for quick bets. The `transactions` table allows authenticated users to read confirmed buy/sell trades for any user, so predictions count will work. If accurate quick trade counts for other users are needed, an RLS policy update or a security-definer function would be required — but this can be addressed as a follow-up if needed.

