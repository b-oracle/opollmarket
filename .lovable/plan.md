## Wave 1 — Critical (highest risk) — DONE

1. ✅ Unique idempotency indices on (payment_provider, nowpayments_payment_id) for deposits & withdrawals.
2. ✅ `confirm-deposit-admin` & `admin-credit-deposit` use shared `_shared/depositCap.ts`.
3. ✅ `transactions.withdrawal_request_id` populated in both `request-withdrawal` and `request-payaza-withdrawal`; `process-withdrawal` updates by id.
4. ✅ Crypto `request-withdrawal` now inserts `withdrawal_requests` FIRST (relying on the unique idempotency_key index), then debits balance — no more check-then-act race.

## Wave 2 — High — DONE

5. ✅ `claim_webhook_deposit` requires provider; NP/Payaza/Flutterwave webhooks scope by provider.
6. ✅ Payaza webhook hard-fails (500) when `PAYAZA_WEBHOOK_SECRET` is unset.
7. ✅ NOWPayments overpayment safety cap (excess > min(invoice*5, $5000) → admin review).
8. ✅ Withdrawal-fee crediting moved to success/approval path (request-withdrawal success, request-payaza-withdrawal success, process-withdrawal approve).
9. ✅ `idempotency_key` accepted by `request-payaza-withdrawal`.
10. ✅ NOWPayments webhook returns 500 when IPN secret is unset (was 200). Bad-signature path already returns 403.

## Wave 3 — Medium (next pass)

11. Drop the 3-arg `adjust_balance` overload (DONE in Wave 1 migration).
12. Migrate `create-payaza-deposit` & `create-flutterwave-deposit` from `getClaims` to `getUser()`.
13. Make pending-deposit cap global across providers.
14. Add a `processing` claim step in `np-reconcile` `fix_expired` action before crediting.
15. Move the `$1000` anomaly threshold into `commission_settings`.

## Wave 4 — Low (defense-in-depth)

16. Tests for new idempotency/uniqueness constraints.
17. Admin dashboard panel for `withdrawal-deposit-audit` outliers.
18. Rate-limit `admin-credit-deposit` / `confirm-deposit-admin` per actor.
