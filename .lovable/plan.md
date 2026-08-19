# Fix: "Market already has refund/payout transactions" blocks cancellation

## What's actually going on

For "Which continent will claim the 2026 world cup" (status `ended`), the transaction history shows:

- 28 Apr — one $5.00 BUY (side NO) by a single user
- 06 May — a $5.00 REFUND to that same user (a cancellation was run then)
- 29 Jun — a $4.62 SELL by that same user

So the market was cancelled once (refund issued), then re-opened/reactivated, and the same user then sold their position. Their position row now has `shares = 0`, i.e. there is **no open exposure left in this market at all**.

The cancel flow refuses to run because `cancel_market_atomic` blocks unconditionally when *any* `refund` or `payout` transaction exists for the market. That guard exists to prevent double refunds, but here it permanently locks a market that already carries a stale refund from the earlier cancellation — the market can never be cancelled or cleared, and it sits in the "ended" tab forever.

Secondary issue exposed by the same data: the refund logic iterates over BUY transactions rather than over open positions, so a user who was refunded and later sold got paid twice from the same $5 stake. Refunding by buy-transaction is unsafe once selling exists.

## The fix

1. **Replace the blanket guard in `cancel_market_atomic`.** Instead of "any refund exists → abort", block only when the market still has open exposure that was already refunded (an actual double-refund risk). Concretely: allow cancellation whenever no position in the market has `shares > 0`, or when no refund exists for the remaining open positions' owners. Markets with zero open exposure cancel cleanly with $0 refunded.

2. **Refund from open positions, not from buy transactions,** in `supabase/functions/cancel-market/index.ts`. For each position with `shares > 0`, refund `shares * avg_price` to that user and log one `refund` transaction referencing the position. Positions already sold or already refunded (shares = 0) are skipped. This makes the flow idempotent and removes the double-payout path.

3. **Keep fee/commission/liquidity reversal proportional to what was actually refunded** — reverse platform-pool fees based on the refunded amount rather than on all historic buys, so a partially-traded market doesn't over-debit the pool.

4. **Clearer admin feedback.** When a cancellation results in $0 refunded (nothing open), the toast should say so ("Market cancelled — no open positions to refund") instead of failing silently or looking like an error.

After this change, cancelling this specific market will succeed: status → `cancelled`, $0 refunded, and it leaves the "ended" tab.

## Technical notes

- Migration: `CREATE OR REPLACE FUNCTION public.cancel_market_atomic(uuid)` with the revised guard (still `SECURITY DEFINER`, `SET search_path = public`, still `FOR UPDATE` locking the market row).
- Edge function `cancel-market`: swap the `transactions … type = 'buy'` loop for a `positions … shares > 0` loop; compute `refundAmount = shares * avg_price` rounded to cents; recompute `totalFeesCollected` from the refunded amounts.
- Creation-fee and initial-liquidity handling stays as-is, but each insert is guarded against an existing matching refund row so a re-run cannot double-pay the creator.
- No schema changes; no changes to resolution/AMM math.
