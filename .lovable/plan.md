

# Financial System Audit Report

After a thorough review of the core financial flows — `place-bet`, `resolve-market`, `cancel-market`, `resolve-quick-round`, `process-pending-commissions`, `nowpayments-webhook`, and `request-withdrawal` — here are the findings.

---

## Critical Issues

### 1. Deposit Webhook: Non-Atomic Balance Update (Race Condition)
**File:** `nowpayments-webhook/index.ts` (lines 109-133)

The `handleDeposit` function reads the balance, then writes `balance + creditAmount` in a separate update. If two webhooks fire concurrently for the same user, one credit can be lost. Every other financial operation uses `adjust_balance` or `debit_balance_atomic` RPC — this is the only one that doesn't.

**Fix:** Replace the read-then-write with `await supabase.rpc("adjust_balance", { _user_id: userId, _delta: creditAmount })`.

---

### 2. Place-Bet Refund Doesn't Reverse Admin Fee Credit
**File:** `place-bet/index.ts` (lines 264-271)

If position insertion fails, the user's balance is refunded. However, the admin pool was already credited `totalFees` (line 185), and the pending commissions were already inserted (lines 202-251). Neither the admin credit nor the pending commissions are reversed, creating phantom revenue.

**Fix:** On position insert failure, also deduct `totalFees` from admin balance and delete the pending commission rows for that transaction.

---

### 3. Cancel-Market Refunds Gross Amount but Fees Already Left the User
**File:** `cancel-market/index.ts` (lines 119-140)

When cancelling, the function refunds `tx.amount` from each `buy` transaction. The `buy` transaction stores the **gross amount** (line 278 of place-bet: `amount: totalCost`). This is correct for the user side. However, the **admin pool** already received the fee portion. The cancel function voids **pending** commissions but does NOT deduct the `totalFees` that were already credited to the admin balance at trade time. This means:

- User gets full refund of gross amount: correct.
- Admin pool retains the fee: **unaccounted surplus**.
- Pending commissions are voided (never disbursed): correct.

The admin pool should be debited by the total fees collected for that market upon cancellation.

**Fix:** Sum all commission transactions for the admin on this market and debit them back.

---

## Medium Issues

### 4. BC400 Pool: Deducted from Admin but Never Actually Deducted
**File:** `process-pending-commissions/index.ts` (lines 81-93)

When BC400 commissions are released, the function increments `bc400_pool_balance` but does NOT deduct from the admin balance (line 96 only runs for non-bc400 types). The BC400 amount is already sitting in the admin's balance from `place-bet`. So the money stays in admin balance AND is tracked as bc400_pool_balance — double-counted.

**Fix:** Add `adjust_balance({ _user_id: adminRole.user_id, _delta: -pc.amount })` for BC400 releases too, since the pool balance is the canonical record.

---

### 5. Quick Trade One-Sided Win: Potential Over-Credit
**File:** `resolve-quick-round/index.ts` (lines 450-495)

When all bettors are on the winning side (one-sided), each winner gets `amount * 1.005 * multiplier`. The 0.5% bonus comes from nowhere — no losing pool funds it. With streak multipliers on top, the platform pays out more than it collected. The `qt_one_sided_bonus` transaction is recorded, but the actual payout (line 465) credits the full `payout` (including the original bet + bonus) without any source of funds.

This is a deliberate design choice (marketing cost), but worth noting as a net cash outflow.

---

### 6. Resolve-Market: Position Aggregation Gap
**File:** `resolve-market/index.ts` (lines 142-166)

Positions are queried with `.gt("shares", 0)`. If a user has multiple positions on the same side (possible via multiple bets), positions might be separate rows. The payout logic iterates each position independently paying `shares * $1`, which is correct. However, if positions were ever **updated in place** (e.g., averaging in), there could be a mismatch. This appears safe given the current insert-only pattern in `place-bet`, but there's no unique constraint on `(user_id, market_id, side)` that I can see — worth verifying no duplicate position accumulation occurs.

---

### 7. Withdrawal: Partial Deposits Counted at Face Value
**File:** `request-withdrawal/index.ts` (lines 170-198)

The withdrawal cap is calculated as `multiplier * totalDeposits - totalWithdrawn`. But the webhook updates partial deposit amounts to the actual credited value (line 143 of webhook). So this should be fine — just confirming the `amount` column in transactions reflects the actual credit, not the requested amount.

---

## Low / Informational

### 8. No Transaction Recorded for Loser Bets on Quick Trade
Quick trade losers get `payout: 0, status: "lost"` on the `quick_bets` table but no entry in `transactions`. This makes admin reconciliation harder since you can't sum all QT losses from the transactions table alone.

### 9. Place-Bet Uses `SUPABASE_ANON_KEY` Env Var Name
Line 25 of `place-bet` uses `SUPABASE_ANON_KEY`. The project's config may set it as `SUPABASE_PUBLISHABLE_KEY` in some contexts. The `resolve-market` function handles both with a fallback (line 30). If this env var is missing, authentication silently fails.

### 10. Commission Split Sum Not Validated
In `place-bet`, the creator + referrer + bc400 splits can theoretically exceed 100% of the fee if misconfigured in `commission_settings`. There's no server-side cap. The admin pool remainder could go negative.

---

## Summary of Recommended Fixes (Priority Order)

| # | Issue | Severity | Effort |
|---|-------|----------|--------|
| 1 | Deposit webhook race condition | Critical | Small |
| 2 | Place-bet refund doesn't reverse admin credit | Critical | Small |
| 3 | Cancel-market doesn't debit admin pool | Critical | Medium |
| 4 | BC400 double-counted in admin balance | Medium | Small |
| 5 | QT one-sided bonus is unfunded outflow | Low (by design) | N/A |
| 10 | Commission split sum not validated | Low | Small |

Would you like me to implement fixes for the critical and medium issues?

