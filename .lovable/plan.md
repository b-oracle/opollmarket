

## Plan: Configurable Commission Split by Creator Tier + Referrer Commission

### Current State
- `place-bet` uses a flat `admin_fee_percent` (pool reserve) and `creator_fee_percent` (same for all creators regardless of verification).
- Referral rewards are one-time bonuses on first prediction only, not ongoing commissions.
- No per-trade referrer commission exists.

### What Changes

**1. Database Migration** -- Add 3 new columns to `commission_settings`:
- `creator_fee_blue_percent` (numeric, default same as `creator_fee_percent`)
- `creator_fee_gold_percent` (numeric, default same as `creator_fee_percent`)
- `referrer_commission_percent` (numeric, default 0) -- % of bet amount paid to the trader's referrer on every trade

The existing `creator_fee_percent` becomes the "no tick" creator fee.

**2. Update `place-bet` Edge Function** (`supabase/functions/place-bet/index.ts`):
- Fetch the new columns from `commission_settings`
- Look up the market creator's `verification_level` from `profiles`
- Apply the correct creator fee based on tier: none → `creator_fee_percent`, blue → `creator_fee_blue_percent`, gold → `creator_fee_gold_percent`
- Calculate referrer commission: look up the betting user's `referred_by` from `profiles`, credit `referrer_commission_percent` of bet amount to referrer's balance
- Record referrer commission as a `commission` transaction with a distinguishing side or type
- Adjust total fee calculation: `totalFees = adminAmount + creatorAmount + referrerAmount`

**3. Update Admin Settings UI** (`src/pages/admin/AdminSettings.tsx`):
- Replace the single "Market Creator Fee" input with 3 inputs:
  - Creator Fee (No Tick) %
  - Creator Fee (Blue Tick) %
  - Creator Fee (Gold Tick) %
- Add "Referrer Commission %" input
- Update the summary breakdown at the bottom to show all 5 splits
- Save the new columns

**4. Update Commission Settings Hook** (`src/hooks/useCommissionSettings.ts`):
- Add the 3 new fields to the interface and query

### Files Changed

| File | Change |
|------|--------|
| DB Migration | Add `creator_fee_blue_percent`, `creator_fee_gold_percent`, `referrer_commission_percent` columns |
| `supabase/functions/place-bet/index.ts` | Tiered creator fee logic + per-trade referrer commission |
| `src/pages/admin/AdminSettings.tsx` | Split creator fee into 3 tier inputs + referrer commission input |
| `src/hooks/useCommissionSettings.ts` | Add new fields |

### Fee Flow Per Trade (example: $100 bet)
```text
Pool Reserve:        2%  → $2 to admin
Creator (no tick):   3%  → $3 to creator
  OR Creator (blue): 4%  → $4 to creator
  OR Creator (gold): 5%  → $5 to creator
Referrer Commission: 1%  → $1 to trader's referrer
Remaining:           goes to market pool
```

