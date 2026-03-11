

## Open Pending Deposit Details from Transaction History

### Problem
When a user taps a pending deposit in their transaction history, nothing happens. They should see the deposit payment instructions (address, amount, QR code) and expiration countdown — the same UI shown during the original deposit flow.

### Approach

Since `pay_address` and `pay_amount` are not stored in the database (only `nowpayments_payment_id` is), we need to fetch them from the NOWPayments API when a user clicks a pending deposit.

### Changes

**1. New edge function: `supabase/functions/get-deposit-status/index.ts`**
- Accepts `{ payment_id: string }` from authenticated user
- Verifies the transaction belongs to the requesting user
- Calls `GET https://api.nowpayments.io/v1/payment/{payment_id}` with the API key
- Returns `{ pay_address, pay_amount, pay_currency, expiration_estimate_date, payment_status, created_at }`

**2. Update `src/components/DepositWithdrawModal.tsx`**
- Add optional prop `resumePaymentId?: string` to allow opening directly into `awaiting_payment` step
- When `resumePaymentId` is provided and modal opens, call the new edge function to fetch payment details, populate `paymentInfo`, set `depositCreatedAt` from the transaction's `created_at`, and jump to `awaiting_payment` step
- Start polling for confirmation as usual

**3. Update `src/pages/Profile.tsx`**
- Add state for `resumePaymentId`
- Make pending/partial deposit transaction rows clickable (add `cursor-pointer` + `onClick`)
- On click, set `resumePaymentId` to the transaction's `nowpayments_payment_id`, set `modalTab` to `"deposit"`, and open the modal
- Pass `resumePaymentId` to `DepositWithdrawModal`

### File Summary
| File | Action |
|------|--------|
| `supabase/functions/get-deposit-status/index.ts` | Create — fetch payment details from NOWPayments |
| `src/components/DepositWithdrawModal.tsx` | Modify — add `resumePaymentId` prop, auto-fetch and resume flow |
| `src/pages/Profile.tsx` | Modify — make pending deposits clickable, pass resume ID to modal |

