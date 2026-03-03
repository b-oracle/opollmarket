

## NOWPayments Integration Plan

This is a significant integration touching database, edge functions, frontend, and admin UI. Here's the full plan:

### Step 1: Store Secrets

Request the user to input two secrets via the secrets tool:
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`

### Step 2: Database Migration

**New table: `withdrawal_requests`**
- `id` (uuid, PK), `user_id` (uuid), `amount` (numeric), `wallet_address` (text), `crypto_currency` (text, default 'usdtbsc'), `status` (text: pending/processing/completed/rejected), `nowpayments_id` (text, nullable), `tx_hash` (text, nullable), `admin_note` (text, nullable), `created_at`, `updated_at`
- RLS: users read own, admins read all, users insert own, admins update

**Alter `transactions` table:**
- Add `nowpayments_payment_id` (text, nullable) for tracking deposit invoices

### Step 3: Edge Functions (4 new)

**`create-deposit/index.ts`** — Authenticated
- Calls NOWPayments "Create Payment" API with user's amount, generates invoice
- Inserts a `pending` deposit transaction with `nowpayments_payment_id`
- Returns the `invoice_url` for redirect

**`nowpayments-webhook/index.ts`** — Public (no auth, verify IPN signature)
- Receives POST from NOWPayments IPN
- Verifies HMAC-SHA512 signature using `NOWPAYMENTS_IPN_SECRET`
- On `finished`/`confirmed` status: credits user's `balances.amount`, updates transaction to `confirmed`
- Idempotent (checks if already processed)

**`request-withdrawal/index.ts`** — Authenticated
- Validates balance, checks `hasDeposit` requirement
- Deducts from `balances.amount` (not bonus)
- Inserts row into `withdrawal_requests` (status: pending)
- Inserts `pending` withdrawal transaction

**`process-withdrawal/index.ts`** — Admin only
- Approve: optionally calls NOWPayments Payout API, updates status to `completed`
- Reject: refunds balance, updates status to `rejected`

### Step 4: Update `supabase/config.toml`

Add `verify_jwt = false` entries for all 4 functions.

### Step 5: Rewrite `DepositWithdrawModal.tsx`

- Remove all wagmi/wallet dependencies (`useAccount`, `useBalance`, mock balances)
- Remove the "approve" step (no longer needed — no on-chain approval)
- **Deposit flow**: Enter amount → call `create-deposit` → redirect to NOWPayments invoice URL in new tab → show "Waiting for confirmation" with polling
- **Withdraw flow**: Enter amount + wallet address input → call `request-withdrawal` → show "Pending admin review" success
- Use real balance from `useUserBalance` hook
- Keep the existing visual style (glass cards, presets, slide animations)

### Step 6: New Admin Page `AdminWithdrawals.tsx`

- Table of withdrawal requests with status, amount, user, wallet address, date
- Approve/Reject buttons that call `process-withdrawal` edge function
- Add to `AdminLayout.tsx` nav items and `App.tsx` route

### Files Summary

| File | Action |
|------|--------|
| DB migration | Create `withdrawal_requests`, add column to `transactions` |
| `supabase/functions/create-deposit/index.ts` | Create |
| `supabase/functions/nowpayments-webhook/index.ts` | Create |
| `supabase/functions/request-withdrawal/index.ts` | Create |
| `supabase/functions/process-withdrawal/index.ts` | Create |
| `supabase/config.toml` | Add function configs |
| `src/components/DepositWithdrawModal.tsx` | Rewrite — remove wallet deps, real NOWPayments flows |
| `src/pages/admin/AdminWithdrawals.tsx` | Create |
| `src/pages/admin/AdminLayout.tsx` | Add Withdrawals nav item |
| `src/App.tsx` | Add withdrawals admin route |

