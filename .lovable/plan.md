

# Plan: Add Fiat Deposit via Payaza Africa

## Overview
Add a fiat (Naira) deposit option alongside the existing crypto deposit flow using Payaza's inline checkout SDK (`@payaza/web-sdk`). Users select "Fiat (NGN)" as a payment method, enter an amount, and a Payaza popup handles card/bank transfer collection. A webhook confirms the payment and credits the user's balance.

## Architecture

```text
User selects "Fiat" → enters amount → clicks Deposit
  ↓
Edge Function (create-payaza-deposit)
  → creates pending transaction in DB
  → returns transaction_reference + merchant_key
  ↓
Client opens Payaza inline popup (PayazaCheckout.setup())
  → user completes payment in popup
  ↓
Payaza sends webhook → Edge Function (payaza-webhook)
  → verifies payload
  → credits balance, updates transaction to "confirmed"
  ↓
Client polls transaction status → shows success
```

## Steps

### 1. Database: Add `payment_provider` column to transactions
- Add a nullable `payment_provider` text column (values: `nowpayments`, `payaza`, null for legacy) so we can distinguish deposit sources.

### 2. Store Payaza API Key
- Use the `add_secret` tool to request the user's Payaza secret key (`PAYAZA_SECRET_KEY`) and public/merchant key (`PAYAZA_MERCHANT_KEY`).

### 3. Create `create-payaza-deposit` Edge Function
- Authenticates user via JWT claims.
- Generates a unique `transaction_reference`.
- Inserts a pending deposit transaction with `payment_provider = 'payaza'`.
- Returns the `transaction_reference` and `merchant_key` to the client (no server-side Payaza API call needed for inline checkout).

### 4. Create `payaza-webhook` Edge Function
- Receives Payaza's IPN/webhook callback.
- Verifies authenticity (signature or secret validation).
- Looks up the transaction by reference.
- Updates transaction to `confirmed`, credits user balance.
- Settles any outstanding debts via `settle_user_debts`.

### 5. Update `DepositWithdrawModal.tsx`
- Add a "Payment Method" toggle: **Crypto** | **Fiat (NGN)**.
- When "Fiat" is selected, hide the crypto selector and show a simple amount input.
- On deposit confirm, call `create-payaza-deposit`, then open the Payaza inline popup:
  ```ts
  import PayazaCheckout from "@payaza/web-sdk";
  const checkout = new PayazaCheckout({
    merchant_key: data.merchant_key,
    transaction_reference: data.transaction_reference,
    amount: numAmount,
    currency: "NGN",
    email: user.email,
    onSuccess: () => { /* poll for confirmation */ },
    onClose: () => { /* handle close */ },
  });
  checkout.showPopup();
  ```
- Poll the transaction status as with crypto deposits.

### 6. Update `supabase/config.toml`
- Add `verify_jwt = false` entries for `create-payaza-deposit` and `payaza-webhook`.

### 7. Admin Deposits page
- No changes needed — the existing `AdminDeposits` page queries all deposits from `transactions` and will automatically show Payaza deposits.

## Dependencies
- Install `@payaza/web-sdk` npm package.
- User must provide `PAYAZA_SECRET_KEY` and `PAYAZA_MERCHANT_KEY` secrets.

## Important Notes
- Payaza's documentation is sparse; the SDK approach (inline popup) is the most reliable integration path based on their npm package.
- The amount will be in NGN; we'll need the user to confirm the USD equivalent or store the NGN amount. We can use a fixed or configurable NGR/USD rate, or let Payaza handle conversion if supported.
- Feature can be gated via a `feature_toggles` entry (`fiat_deposit_payaza`) so admins can enable/disable it.

