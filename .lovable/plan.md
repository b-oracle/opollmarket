## Investigation Results: Withdrawal Failure

### Root Cause

The withdrawal is failing at the **NOWPayments Payout API** level. The edge function logs show:

```
Payout API error: {"status":false,"statusCode":403,"code":"ENDPOINT_NOT_ALLOWED","message":"Access denied | Invalid IP - 2a05:d01c:76e:7907:..."}
```

NOWPayments requires you to **whitelist specific IP addresses** for the Payout API. Since the backend functions run on shared cloud infrastructure, the outbound IP changes and gets blocked by NOWPayments.

### This is NOT a code issue

The `request-withdrawal` edge function logic is correct — it authenticates, validates, estimates, and attempts the payout. NOWPayments simply rejects the request due to IP restrictions on their Payout endpoint.

### What needs to happen (no code changes required)

1. **Log into your NOWPayments dashboard** at [https://account.nowpayments.io](https://account.nowpayments.io)
2. Go to **Settings → Payout Settings** (or API Keys section)
3. Either **whitelist the IP addresses** shown in the error logs, or **disable IP whitelisting** for the Payout API if NOWPayments offers that option
4. Note: Cloud-hosted functions use dynamic IPs, so whitelisting specific IPs may not be a permanent fix

### Alternative approach (if IP whitelisting is impractical)

Switch withdrawals to a **manual approval flow**: the edge function would create a `pending` withdrawal request instead of auto-processing via NOWPayments. Admins then approve/reject from the Admin Withdrawals panel (which already exists), and payouts are sent manually from your NOWPayments dashboard or wallet. This avoids the IP restriction entirely.

### Stability Guard Note

No code changes are proposed. If you want to switch to manual approval mode, I'll outline what that changes before touching anything.