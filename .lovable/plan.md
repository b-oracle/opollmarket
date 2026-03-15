

# Prediction Fee Distribution System

## Current State

Currently, the system charges a single **"Prediction Fee"** (`admin_fee_percent`) — the entire amount is credited to the admin's balance. A separate **"Referrer Commission"** (`referrer_commission_percent`) is deducted additionally from the wager and paid to the trader's referrer. The term used in the admin UI is **"Prediction Fee"** and the admin pool is called the **"Pool Reserve"** (the admin balance).

The `creator_fee_percent`, `creator_fee_blue_percent`, and `creator_fee_gold_percent` columns exist in the DB but are **not used** in the `place-bet` flow (removed in the recent simplification). The `distribute-revenue-shares` function still references `creator_fee_percent` for post-resolution revenue sharing.

There is no BC400 reward pool concept anywhere in the codebase currently.

---

## Proposed Fee Model

From each prediction wager, deduct a **total prediction fee** (sum of all commission splits). This entire fee goes to the **Pool Reserve** (admin balance). Then commissions are paid **out of** that pool reserve:

| Field (DB column) | Label in Admin UI | Description |
|---|---|---|
| `admin_fee_percent` | Pool Reserve (%) | Platform's net take — stays in admin pool |
| `referrer_commission_percent` | Referrer Commission (%) | Paid to the predictor's referrer |
| `creator_fee_percent` | Creator Fee — Unverified (%) | Paid to unverified market creators |
| `creator_fee_blue_percent` | Creator Fee — Blue Tick (%) | Paid to blue-verified market creators |
| `creator_fee_gold_percent` | Creator Fee — Gold Tick (%) | Paid to gold-verified market creators |
| `bc400_pool_percent` *(new)* | BC400 Reward Pool (%) | Allocated to the BC400 reward pool |

**Total Prediction Fee** = sum of all 6 fields above.

The **exit fee** (`exit_fee_percent`) continues to work as-is — charged on early exits and credited to the admin pool reserve.

---

## Changes Required

### 1. Database Migration
- Add `bc400_pool_percent` column (numeric, default 0) to `commission_settings`
- Add `bc400_pool_balance` column (numeric, default 0) to `commission_settings` to track the accumulated BC400 pool

### 2. Admin Settings UI (`AdminSettings.tsx`)
Restructure the "Market Prediction Fees" card:
- **Pool Reserve (%)** — platform's net take (rename current "Prediction Fee")
- **Creator Fee — Unverified (%)** — re-enable the existing `creator_fee_percent` field
- **Creator Fee — Blue Tick (%)** — re-enable existing `creator_fee_blue_percent` field
- **Creator Fee — Gold Tick (%)** — re-enable existing `creator_fee_gold_percent` field
- **Referrer Commission (%)** — move into this card from its current position
- **BC400 Reward Pool (%)** — new field
- **Fee Summary** at the bottom showing all splits + total + remaining pool %
- **Early Exit Fee** remains as a sub-card (goes to pool reserve)

### 3. `place-bet` Edge Function
Restore per-trade creator fee logic:
1. Fetch `admin_fee_percent`, `creator_fee_percent`, `creator_fee_blue_percent`, `creator_fee_gold_percent`, `referrer_commission_percent`, `bc400_pool_percent`
2. Look up market creator's `verification_level`
3. Pick the correct creator fee rate based on tier
4. Calculate all splits from the wager
5. Credit **entire total fee** to admin pool reserve first
6. Then distribute: creator commission, referrer commission, BC400 pool — all paid from admin balance
7. `poolAmount = wager - totalFee` goes into market liquidity

### 4. `BetModal.tsx`
Update fee display to show the **total prediction fee** (sum of all applicable splits) so users see a single transparent percentage.

### 5. `copy-trade`, `approve-copy-trade`, `telegram-bot`
Same pattern: restore creator fee calculation in the share/fee logic.

### 6. `useCommissionSettings.ts`
Add `bc400_pool_percent` field to the hook interface and query.

### Files to modify
- **Database migration** — add `bc400_pool_percent`, `bc400_pool_balance`
- `src/pages/admin/AdminSettings.tsx` — restructure fee card
- `src/hooks/useCommissionSettings.ts` — add new field
- `src/components/BetModal.tsx` — show total fee (all splits combined)
- `supabase/functions/place-bet/index.ts` — restore creator fee + add BC400 pool logic
- `supabase/functions/copy-trade/index.ts` — restore creator fee in share calc
- `supabase/functions/approve-copy-trade/index.ts` — same
- `supabase/functions/telegram-bot/index.ts` — same

