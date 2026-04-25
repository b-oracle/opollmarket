## Wave 1 — Critical (highest risk)

1. **Add unique idempotency indices** for external payment IDs.
   - Migration: `CREATE UNIQUE INDEX CONCURRENTLY transactions_provider_payment_id_uniq ON transactions (payment_provider, nowpayments_payment_id) WHERE nowpayments_payment_id IS NOT NULL;`
   - Backfill `payment_provider` to `'nowpayments'` for legacy rows that have a numeric `nowpayments_payment_id` and null provider before adding the index.

2. **Wire `confirm-deposit-admin` to the shared `_shared/depositCap.ts` validator**, replacing the inline cap (lines 91–101). Reject (don't fall back) when both `gross_amount_usd` and `net_amount_usd` are null on `wrong_asset`/`partial` rows.

3. **Link `transactions` ↔ `withdrawal_requests` via a new `withdrawal_request_id` column** on `transactions`, populate it in `request-withdrawal` and `request-payaza-withdrawal`, and switch `process-withdrawal` to update by id instead of `.order().limit(1)`.

4. **Remove duplicate-by-race in `request-withdrawal` (crypto)**: convert the idempotency check to a single `INSERT … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id` on `withdrawal_requests`, and only call `debit_balance_atomic` if the insert returned a row.

## Wave 2 — High

5. **Add `payment_provider` filter to all webhook claim paths**: update `claim_webhook_deposit` to require provider, change Payaza/Flutterwave/NOWPayments webhooks to pass it, and stop matching on `nowpayments_payment_id` alone.

6. **Hard-fail Payaza webhook when `PAYAZA_WEBHOOK_SECRET` is unset** (mirror Flutterwave pattern).

7. **Cap NOWPayments overpayment auto-credit**: when `excess > min(requested * 5, $5000)`, mark as `wrong_asset` for admin review instead of auto-crediting bonus.

8. **Move withdrawal-fee crediting to `process-withdrawal` approval path** (today it's pre-credited in `request-withdrawal` regardless of payout outcome).

9. **Add `idempotency_key` to `request-payaza-withdrawal`** matching the crypto withdrawal pattern.

10. **Return 403 from NOWPayments webhook on signature failure** (currently swallowed behind a 200 in the catch-all).

## Wave 3 — Medium

11. Drop the 3-arg `adjust_balance` overload (now unused after recent refactors).
12. Migrate `create-payaza-deposit` & `create-flutterwave-deposit` from `getClaims` to `getUser()`.
13. Make pending-deposit cap global across providers.
14. Add a `processing` claim step in `np-reconcile` `fix_expired` action before crediting.
15. Move the `$1000` anomaly threshold into `commission_settings`.

## Wave 4 — Low (defense-in-depth, post-critical)

16. Add tests for the new idempotency/uniqueness constraints (extend the existing `concurrency_test.ts`).
17. Add an admin dashboard panel surfacing the `withdrawal-deposit-audit` outliers (4 users found today).
18. Consider rate-limiting `admin-credit-deposit` / `confirm-deposit-admin` per actor.

## What I will NOT touch

- Storage bucket listing / search_path / `SECURITY DEFINER` view linter warnings — these are outside the deposit/withdrawal scope. Happy to address in a separate pass.
- The 4 pre-existing users with withdrawals > deposits (they look legitimate; I'll surface them in an admin view for review rather than auto-clawback).