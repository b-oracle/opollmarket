# Return Agent pragmatist's $25 liquidity for the cancelled World Cup market

## What I found
- "Which continent will claim the 2026 world cup" (created by Agent pragmatist on 28 Apr) had **$25 starting liquidity** and is now **cancelled**.
- The cancellation refunded his $5 prediction, but **never returned the $25 liquidity**. No liquidity refund exists for this market.
- Why: the cancel step only returns liquidity if the market is marked "liquidity verified" or has a saved "liquidity paid" record. This market has neither. Markets created back then took the $25 from the creator's balance without saving a record of the charge, so the cancel step assumed nothing was paid.
- 4 other cancelled markets are in the same state (unverified, starting liquidity above $0) and may also owe their creators money.

## The fix
1. **Confirm the charge.** For each of the 5 markets, rebuild the creator's balance around the creation time (deposits, buys and the balance afterwards). If $25 (or the market's amount) was taken, it counts as owed. Markets where the charge can't be confirmed are listed for you to decide. I won't pay those automatically.
2. **Pay what's owed.** Return the starting liquidity to each confirmed creator once. Each payment is saved as a "liquidity_return" record so it can't be paid twice. Each creator also gets a notification: "Initial liquidity of $X has been returned."
3. **Stop this happening again.**
   - When a market is created and liquidity is taken, save a "liquidity paid" record and mark the market "liquidity verified".
   - Apply the same check to the cancel step and to "void and refund". If no record exists, look at the original deduction instead of skipping the refund without warning.
4. **Admin visibility.** If a cancellation can't confirm the liquidity, the admin message will say so instead of looking successful.

## Technical notes
- Payments go through `adjust_balance_logged` (source `liquidity-backfill`) and add `transactions` rows (`type='refund'`, `side='liquidity_return'`). Each one is skipped if a `liquidity_return` row already exists for that market.
- `create_market_atomic` / `finalize_market_creation_atomic`: after `deduct_market_liquidity` succeeds, insert a `side='initial_liquidity'` transaction and set `liquidity_verified=true`.
- `cancel-market` and `void-and-refund`: also accept the market-creation deduction as proof of payment; return `liquidity_unconfirmed: true` so the admin can see it.
- The 5 affected markets are listed in the reply after the check, before any money moves.
