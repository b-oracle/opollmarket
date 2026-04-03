

## Welcome Bonus on First Deposit

### Overview
After a user completes KYC and makes their first deposit, they receive X% of that deposit amount (capped at $X) as bonus balance. Admin can toggle this on/off and configure the percentage and cap.

### Database Changes

**Migration 1 — Add settings to `commission_settings`:**
```sql
ALTER TABLE public.commission_settings
  ADD COLUMN welcome_bonus_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN welcome_bonus_cap numeric NOT NULL DEFAULT 0;
```
- `welcome_bonus_percent` — e.g. 50 means 50% of first deposit
- `welcome_bonus_cap` — e.g. 10 means max $10 bonus

**Migration 2 — Add feature toggle row:**
```sql
INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('welcome_bonus', 'Welcome Bonus (First Deposit)', false);
```

### Server-Side Logic

Create a reusable helper function used by all 3 deposit confirmation paths. After crediting the deposit:

1. Check `feature_toggles` — is `welcome_bonus` enabled?
2. Check `profiles` — is `kyc_status` = `'approved'` (tier 1 or 2)?
3. Check `transactions` — does the user have any prior confirmed deposits (excluding the current one)? If yes, skip.
4. Read `commission_settings` for `welcome_bonus_percent` and `welcome_bonus_cap`
5. Calculate: `bonus = min(deposit_amount * percent / 100, cap)`
6. Credit via `adjust_balance` with `_bonus_delta: bonus`
7. Log a `welcome_bonus` transaction and send a notification

**Files modified:**
- `supabase/functions/nowpayments-webhook/index.ts` — call welcome bonus helper after `handleDeposit` credits balance
- `supabase/functions/flutterwave-webhook/index.ts` — call welcome bonus helper after deposit confirmation
- `supabase/functions/confirm-deposit-admin/index.ts` — call welcome bonus helper after manual confirmation

The helper will be inlined in each file (edge functions can't share imports across folders) but with identical logic.

### Admin UI

- The feature toggle already appears automatically in the Admin Settings toggle grid under a relevant category
- Add `welcome_bonus_percent` and `welcome_bonus_cap` fields to `src/pages/admin/AdminSettings.tsx` (or wherever commission settings are edited), visible when the toggle is enabled

### Client-Side

- Add `welcome_bonus_percent` and `welcome_bonus_cap` to `useCommissionSettings.ts` so the admin UI can read/write them
- Optionally show a "Welcome Bonus" banner on the deposit page for eligible users (KYC approved, no prior deposits)

### Security
- All eligibility checks and bonus crediting happen server-side
- The bonus is added to `bonus_balance` (non-withdrawable, usable for fees)
- One-time only: checked by counting prior confirmed deposits

