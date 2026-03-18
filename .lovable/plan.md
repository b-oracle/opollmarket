

## Problem

Currently, when a user clicks the fee bypass button, they are immediately granted access to the market creation form with no upfront charge. The fee is only deducted at final submission. This means users can browse the form, waste time, and abandon without consequence — leading to lost revenue and no commitment.

## Solution

Implement an **escrow-based fee bypass flow** with three stages:

1. **Balance check + confirmation dialog** — When the button is clicked, check if balance >= `marketCreationFee`. If insufficient, show a toast error. If sufficient, show an AlertDialog warning: "You will be charged $50 for market creation. Do you still want to proceed?"

2. **Immediate escrow hold** — On "Proceed", escrow the fee by inserting a row into a new `creation_fee_escrows` table and deducting from the user's balance via `debit_balance_atomic`. Show "Access Granted!" toast.

3. **Escrow enforcement** — The escrowed amount blocks withdrawals and other actions until market creation is completed. On successful submission, the escrow record is marked `used`. On the submission side, the fee is already held so we skip re-deducting it.

### Database Changes

**New table: `creation_fee_escrows`**
- `id` uuid PK
- `user_id` uuid NOT NULL
- `amount` numeric NOT NULL
- `status` text NOT NULL DEFAULT 'held' (held | used | refunded)
- `created_at` timestamptz DEFAULT now()
- `released_at` timestamptz NULL

RLS: Users can SELECT own rows. No client INSERT/UPDATE/DELETE (service role only).

**New RPC: `hold_creation_fee_escrow`** (SECURITY DEFINER)
- Params: `_user_id uuid, _amount numeric`
- Atomically deducts from balance (fails if insufficient), inserts escrow row, returns escrow id

**New RPC: `release_creation_fee_escrow`** (SECURITY DEFINER)
- Params: `_escrow_id uuid, _action text` ('used' or 'refunded')
- Marks escrow as used/refunded. If refunded, credits balance back.

### Edge Function Changes

**`request-withdrawal/index.ts`** — Before processing, check if user has any `creation_fee_escrows` with `status = 'held'`. If yes, reject with "You have a pending market creation fee in escrow. Complete your market first."

**`place-bet/index.ts`** — Same check: reject bets if user has held escrow (optional, based on user's request to block "anything else").

### Frontend Changes (`src/pages/Create.tsx`)

1. **`handleFeeBypass`** — Replace the simple state toggle with:
   - Fetch balance, check >= fee
   - If insufficient: toast error + optionally open deposit modal
   - If sufficient: open AlertDialog with warning text
   - On confirm: call `hold_creation_fee_escrow` RPC, set `feeBypass=true`, `gatePassed=true`, store escrow ID in state, toast "Access Granted!"

2. **Add AlertDialog** for the confirmation prompt using existing `AlertDialog` component.

3. **`handleSubmit`** — When `feeBypass` is true and escrow ID exists, skip the fee portion of `deduct_market_liquidity` (fee already escrowed). After successful market save, call `release_creation_fee_escrow` with 'used'. Credit escrowed amount to `platform_pool`.

4. **On page unload** — The escrow stays held. User must return to `/create` and complete market creation to release it. The escrow row persists in DB.

5. **Resume escrow on mount** — On page load, check if user has a `held` escrow. If yes, auto-set `feeBypass=true` and `gatePassed=true` so they go straight to the form.

### Summary of files to create/edit
- **Migration SQL** — `creation_fee_escrows` table + 2 RPCs
- **`supabase/functions/request-withdrawal/index.ts`** — Add escrow block check
- **`src/pages/Create.tsx`** — Escrow flow, AlertDialog, resume logic, adjusted submission

