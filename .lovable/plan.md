

## Fix Deposit Expiration Timer — Increase to 1 Hour

### Investigation Findings
The `nowpayments-webhook` edge function has **zero logs**, meaning the IPN callback was never received from NOWPayments for those two pending deposits. The payment was likely never sent on-chain, or the blockchain confirmation hasn't completed yet. Without the webhook firing, the system cannot auto-credit.

### What Changes
Increase the client-side deposit expiration countdown from 30 minutes to 1 hour.

### Implementation

**File: `src/components/DepositWithdrawModal.tsx` (line 168)**

Change:
```typescript
const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
```
To:
```typescript
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour
```

That single line change extends the visible countdown timer from 30 minutes to 1 hour, giving users more time before the UI shows "Expired."

The database-side expiration function (`expire_stale_pending_deposits`) already uses a 2-hour window, so no backend change is needed.

