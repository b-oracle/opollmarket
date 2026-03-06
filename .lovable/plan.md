

## Streak Bonus Multiplier for Quick Trade

### Overview
Add a streak tracking system that rewards consecutive Quick Trade wins with a payout multiplier bonus. The streak is calculated server-side during round resolution and displayed on the Quick Trade UI.

### Database Changes

1. **Add `streak` column to `quick_bets` table** — stores the user's streak count at the time each bet was placed, so the resolver can apply the correct multiplier.

2. **Create `quick_trade_streaks` table** — tracks each user's current consecutive win count:
   - `user_id` (uuid, PK, references profiles)
   - `current_streak` (integer, default 0)
   - `best_streak` (integer, default 0)
   - `updated_at` (timestamptz)
   - RLS: users can read their own streak; service role manages updates

### Streak Multiplier Tiers
- 0-1 wins: 1x (no bonus)
- 2 wins: 1.05x (5% bonus)
- 3 wins: 1.10x (10% bonus)
- 4 wins: 1.15x (15% bonus)
- 5+ wins: 1.25x (25% bonus)

### Backend Changes (`resolve-quick-round/index.ts`)

In the winner payout loop:
1. Fetch user's `quick_trade_streaks` row
2. Apply multiplier to the payout based on `current_streak`
3. Increment `current_streak` and update `best_streak` if higher
4. For losers: reset `current_streak` to 0
5. Include streak info in the winner notification message

### Frontend Changes (`src/pages/QuickTrade.tsx`)

1. **Streak badge** — show current streak next to the balance display (e.g., "🔥 3 Win Streak — 1.10x Bonus")
2. **Fetch streak** — query `quick_trade_streaks` for the logged-in user, refresh on round resolution
3. **Streak indicator in bet confirmation area** — when user has an active streak, show the multiplier they'll earn on their next win
4. **History enhancement** — show streak bonus badge on won bets that received a multiplier

### File Changes Summary
- `supabase/migrations/` — new migration for `quick_trade_streaks` table + `streak` column on `quick_bets`
- `supabase/functions/resolve-quick-round/index.ts` — add streak lookup, multiplier application, streak updates
- `src/pages/QuickTrade.tsx` — add streak display UI, fetch streak data, show multiplier info

