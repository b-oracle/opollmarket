

## Plan: Quick Trade One-Sided Market Bonus

### Problem
Currently, when a quick trade round has all winners and no losers (one-sided), winners are charged the platform fee (`platformFee`) and receive `amount * (1 - platformFee)`. This is unfair since there's no losing pool to justify fees.

### Changes

#### 1. Add `qt_one_sided_bonus` column to `commission_settings`
- Migration: `ALTER TABLE commission_settings ADD COLUMN qt_one_sided_bonus boolean NOT NULL DEFAULT true;`
- When `true`: one-sided winners get `amount * 1.005` (no fee, +0.5% bonus)
- When `false`: revert to original behavior (charge fee)

#### 2. Update `resolve-quick-round/index.ts`
- Read `qt_one_sided_bonus` from settings alongside other fields
- In the `losers.length === 0` branch:
  - If bonus enabled: `payout = amount * 1.005 * streakMultiplier` (no fee deduction)
  - If bonus disabled: keep current `amount * (1 - platformFee) * streakMultiplier`

#### 3. Add toggle to `AdminSettings.tsx`
- New state: `qtOneSidedBonus`
- Load from settings, save with other fields
- Render a Switch in the Quick Trade Settings card: "One-Sided Bonus — No fee + 0.5% bonus when all bets are on the winning side"

#### 4. Refund past one-sided winners via edge function
- Create a one-time edge function `refund-one-sided-qt` that:
  1. Finds all resolved quick rounds where all bets went one way (no losers)
  2. For each winning bet: calculates `fee_charged = amount * platformFee` and `bonus_owed = amount * 0.005`
  3. Credits `fee_charged + bonus_owed` to each user's balance
  4. Inserts a notification per user
  5. Logs total refunded
- Invoke it once manually after deployment

### Technical Details

**Edge function resolution logic change (line 471-502):**
```
} else if (losers.length === 0) {
  for (const bet of winners) {
    const streak = ...;
    const multiplier = ...;
    const basePayout = qtOneSidedBonus
      ? Number(bet.amount) * 1.005
      : Number(bet.amount) * (1 - platformFee);
    const payout = basePayout * multiplier;
    // ... credit & update
  }
}
```

**Settings toggle UI** — placed right below the Platform Fee input in the Quick Trade Settings card.

