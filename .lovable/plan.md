

## Plan: Fix Partial Deposits Not Getting Credited

### Root Cause

Two issues identified:

**1. Webhook ignores `partially_paid` status from NOWPayments**
Line 291 of `nowpayments-webhook/index.ts` only accepts `"finished"` and `"confirmed"` payment statuses. NOWPayments sends partial payments with status `"partially_paid"`, which gets silently ignored. The partial detection logic (line 101) that compares `outcome_amount` vs `requestedAmount` never runs because the webhook exits early.

**2. Admin Deposits page — no separate bug**
The page correctly queries for `status = 'partial'` deposits. Since partial payments are never created (due to issue #1), the table shows nothing. Once the webhook is fixed, partial deposits will appear.

### Changes

**File: `supabase/functions/nowpayments-webhook/index.ts`**

Update the status filter (line 291) to also accept `"partially_paid"`:

```typescript
if (payment_status !== "finished" && payment_status !== "confirmed" && payment_status !== "partially_paid") {
  console.log(`Ignoring status: ${payment_status}`);
  return new Response("OK", { status: 200, headers: corsHeaders });
}
```

When `payment_status === "partially_paid"`, the existing `handleDeposit` logic already correctly:
- Uses `outcome_amount` (actual USD received) as the credit amount
- Compares against the requested amount with 2% tolerance
- Sets status to `"partial"` when underpaid
- Notifies the user of the shortfall
- Settles any outstanding debts

No other changes needed — the admin page, manual confirmation, and debt settlement all already handle partial deposits correctly.

