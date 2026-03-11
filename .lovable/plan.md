

## Make All Withdrawal Failures Fall Back to Pending

### Problem
Currently, only `403` errors from NOWPayments trigger the "pending for manual admin processing" fallback. All other failures (400, 500, network errors) refund the user and show an error, meaning the withdrawal is lost and the user must retry.

### Change
In `supabase/functions/request-withdrawal/index.ts`, remove the `got403`-specific fallback and make **all** payout failures create a pending withdrawal request for admin review. The balance stays deducted (already done before the payout attempt), and the admin can approve/reject via `process-withdrawal`.

### What changes
**`supabase/functions/request-withdrawal/index.ts`** — one section updated:

- Remove the `got403` boolean tracking
- After the payout attempt, if `!payoutSuccess` (regardless of error type), insert a `pending` withdrawal request + `pending` transaction + notify user — same logic currently used only for 403
- Remove the separate "non-403 refund" block entirely
- Keep the 403-specific `console.warn` for logging but don't branch on it

The net effect: users always see "Withdrawal submitted" and admins always get a pending withdrawal to process, whether the failure was a 400 whitelist error, 500 server error, or network timeout.

