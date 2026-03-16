

# oSURE — Prediction Insurance Feature

## Overview
oSURE lets users insure their predictions against losses. Users select an insurance tier (25%, 50%, or 100%) before confirming, pay a premium charged as a percentage of their wager, and receive a claim into a special "insurance balance" if they lose. This insurance balance can only be used for new predictions and unlocks into the main balance upon winning.

## Database Changes

### 1. New columns on `commission_settings`
Add admin-configurable insurance parameters:
- `osure_25_premium` (numeric, default 10) — premium % for 25% coverage
- `osure_50_premium` (numeric, default 20) — premium % for 50% coverage
- `osure_100_premium` (numeric, default 30) — premium % for 100% coverage
- `osure_enabled` (boolean, default true) — global toggle

### 2. New column on `balances`
- `insurance_balance` (numeric, default 0) — holds claimable insurance funds

### 3. New column on `positions`
Track insurance per position for claim processing on resolution:
- `insurance_tier` (numeric, nullable) — 0.25, 0.50, or 1.00 (null = no insurance)
- `insurance_premium` (numeric, default 0) — premium amount paid
- `insurance_claimed` (boolean, default false)

### 4. New table: `insurance_claims`
Audit trail for insurance activity:
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `position_id` (uuid, NOT NULL)
- `market_id` (uuid, NOT NULL)
- `tier` (numeric) — 0.25/0.50/1.00
- `premium_paid` (numeric)
- `claim_amount` (numeric)
- `status` (text, default 'pending') — pending/claimed/forfeited
- `created_at`, `claimed_at`

RLS: users read own, admins read all.

## Backend Changes

### 5. `place-bet` Edge Function
- Accept new fields: `insuranceTier` (optional: 25, 50, 100)
- Look up premium % from `commission_settings`
- Calculate premium: `amount * (premiumPercent / 100)`
- Deduct premium from main balance (or insurance balance if user is betting from insurance)
- Credit premium to admin pool reserve
- Store `insurance_tier` and `insurance_premium` on the position
- Insert `insurance_claims` record with status `pending`

### 6. `resolve-market` Edge Function
- On loss: if position has `insurance_tier`, calculate claim = `netAmount * insurance_tier`, credit to `insurance_balance`, update claim status to `claimed`
- On win: mark claim as `forfeited`, AND unlock the user's insurance balance into main balance (move `insurance_balance` → `amount`)

## Frontend Changes

### 7. BetModal — Insurance Selection Step
After user enters amount and clicks "Review Order", show an intermediate oSURE step before the confirm screen:
- Branded "oSURE" header with Shield icon
- Three selectable cards: 25% / 50% / 100% coverage
- Each shows: coverage amount, premium cost
- "Skip Insurance" option
- Premium added to total cost display on confirm screen

### 8. `useUserBalance` Hook
- Expose `insuranceBalance` from the `balances` table
- Show in Portfolio page balance breakdown

### 9. Portfolio Page
- Display insurance balance separately with a shield icon
- Show "Insured" badge on positions that have insurance

### 10. Admin Settings
- New "oSURE" tab or section within the Fees tab
- Toggle to enable/disable oSURE globally
- Configurable premium percentages for each tier (25%, 50%, 100%)

### 11. `useCommissionSettings` Hook
- Add `osure_25_premium`, `osure_50_premium`, `osure_100_premium`, `osure_enabled` fields

## Flow Summary

```text
User enters amount → Clicks "Review" → oSURE selection screen
  ├─ Selects 25% → Premium = 10% of wager
  ├─ Selects 50% → Premium = 20% of wager
  ├─ Selects 100% → Premium = 30% of wager
  └─ Skip → No insurance

Total cost = wager + premium
Premium → Admin Pool Reserve

On Resolution:
  Loss + Insured → claim_amount = net_wager × tier → insurance_balance
  Win + Insured → premium forfeited, insurance_balance unlocked → main balance
  No insurance → no claim
```

## Implementation Order
1. Database migration (columns + table)
2. Update `place-bet` edge function
3. Update `resolve-market` edge function
4. Update `useCommissionSettings` and `useUserBalance` hooks
5. Build oSURE selection UI in BetModal
6. Update Portfolio to show insurance balance and badges
7. Add admin settings controls

