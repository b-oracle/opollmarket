

## Plan: Wire Market Boosting to NOWPayments with Auto-Approval

### Current State
- **BoostMarketModal** shows a manual flow: copy a wallet address, paste a TX hash, submit as "pending"
- **create-deposit** edge function already integrates with NOWPayments API to create payments
- **nowpayments-webhook** handles IPN callbacks but only processes `deposit_` order IDs

### Changes

#### 1. New Edge Function: `create-boost-payment`
Creates a NOWPayments payment for a boost. Requires authenticated user.
- Accepts `market_id`, `tier`, `amount` 
- Calls NOWPayments API with `order_id = boost_{marketId}_{tier}_{userId}_{timestamp}`
- Inserts a `market_boosts` row with `status: "pending"` and `nowpayments_payment_id` stored in `tx_hash`
- Returns `pay_address`, `pay_amount`, `pay_currency` to the frontend

#### 2. Update `nowpayments-webhook` Edge Function
Extend the webhook to handle `boost_` order IDs in addition to `deposit_`:
- Parse `order_id` → if prefix is `boost_`, extract `marketId`, `tier`, `userId`
- Look up the pending `market_boosts` row by `nowpayments_payment_id`
- Set `status = "active"`, set `starts_at = now()`, calculate `ends_at` based on tier duration
- Send a notification to the user confirming the boost is live

#### 3. DB Migration: Add `nowpayments_payment_id` to `market_boosts`
Add a nullable text column to track the NOWPayments payment ID for idempotency.

#### 4. Update `BoostMarketModal` Component
Replace the manual copy-address + TX-hash flow with:
- User selects tier → clicks "Pay & Boost"
- Calls `create-boost-payment` edge function
- Shows the returned `pay_address` and `pay_amount` with a copy button
- Polls the `market_boosts` table for status change from `pending` → `active`
- Shows success state when boost is auto-activated

#### 5. Config: `supabase/config.toml`
Add `verify_jwt = false` for the new `create-boost-payment` function.

### Flow Summary
```text
User selects tier → Frontend calls create-boost-payment
  → Edge function creates NOWPayments payment + pending boost row
  → Frontend shows pay address & polls for activation
User sends crypto → NOWPayments IPN fires
  → Webhook verifies signature, sees "boost_" prefix
  → Sets boost to "active" with correct end time
  → Frontend poll detects active status → shows success
```

