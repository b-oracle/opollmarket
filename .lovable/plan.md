## Issue

Two of the user's Twitter markets resolved early using an incomplete tweet count:

| Market | Title window | `end_date` | `auto_resolve_deadline` | Status | Winning bracket | Count |
|---|---|---|---|---|---|---|
| `0eec8a9d…` | "Agent BG's tweets Apr 1–15" | 2026-04-12 | 2026-04-15 05:00 | resolved | 151–200 | 192 |
| `31dfd76e…` | "Elon Musk's posts by May 31" | 2026-04-12 | 2026-05-31 11:59 | resolved | 501–1000 | 599 |

A third market (`3f2baea2…`, Instablog9ja, deadline Nov 2026) was resolved on the same day with the same pattern.

**Root cause** — three bugs combine:

1. `fetch-twitter-metrics` (lines 217–218 and 270–271) clamps the tweet count window to `created_at … end_date+23:59:59Z`. For these markets the true measurement window per the title runs to `auto_resolve_deadline`, which is later than `end_date`. The stored `twitter_current_count` was therefore an undercount of the true total.
2. The resolver/cron path is treating `end_date` as a finalization trigger for Twitter auto-resolve markets even though `auto_resolve_deadline` is later. The markets flipped to `resolved` at `end_date` midnight, locking in the undercount.
3. Market creation never validates that `end_date >= auto_resolve_deadline`, so a creator (or import) can set a betting cutoff earlier than the measurement window.

The losing-side users (and the creator) are correct that those markets should not have resolved on April 12 — they should still be open until their declared deadline, OR be voided and refunded.

## Fix

### 1. Data restitution (one-time SQL migration)

For the 3 affected markets (`0eec8a9d-…`, `31dfd76e-…`, `3f2baea2-…`):

- Reverse each market to `cancelled` (treat the early resolution as void).
- Reverse the existing payout transactions:
  - BG: claw back the $31.05 payout to user `72fa…` (mark reversed) and refund every buy at full cost basis.
  - Elon & Instablog9ja: no payouts were ever issued (no `payout` rows exist), so just refund every buy at full cost basis.
- Also refund the $5 already refunded to `fa7849…` is left as-is; we only top up the still-outstanding losers.
- Mirror the standard `cancel-market` logic: refund creation/auto_resolve fees if charged, return the remaining initial liquidity (already partially returned), zero out positions, and reverse the `liquidity_return` fee.
- Insert `notifications` for each refunded user explaining the void.
- Set `status='cancelled'`, clear `winning_option_id`, `resolved_side`.

This will restore the principal of every user who lost on those three markets, including the user who wrote in.

### 2. Code fixes (prevent recurrence)

**`supabase/functions/fetch-twitter-metrics/index.ts`** — when the market has `auto_resolve_deadline`, use it as `endTime` instead of `end_date+T23:59:59Z`:
- Update both call sites (single-market path ~line 213-223 and bulk loop ~line 261-276) to read `auto_resolve_deadline` and prefer it when present.

**`supabase/functions/check-auto-resolve/index.ts`** — Twitter resolution loop (~line 480-484):
- Before resolving, force-refresh the count for that single market by invoking `fetch-twitter-metrics` with `{ market_id, metric_type, resource_id }`. Use the returned value rather than the cached `twitter_current_count`.
- Keep the existing `now <= deadline → continue` guard.

**`supabase/functions/close-expired-markets/index.ts`** — exclude Twitter auto-resolve markets from the generic `end_date <= today` close path; they should only flip to `ended`/`resolved` based on `auto_resolve_deadline`. Mirror the existing carve-out used for sports auto-resolve markets.

**Market-creation RPCs (`upsert_market`, `create_draft_market`, etc.)** — for Twitter auto-resolve markets, automatically set `end_date := auto_resolve_deadline::date` (and reject if a creator tries to submit `end_date < auto_resolve_deadline::date`). Same guard in the create-market form on the client side.

**`supabase/functions/resolve-market/index.ts`** — defensive guard: if `market.auto_resolve = true` and `auto_resolve_deadline > now()`, refuse the resolution unless the request includes `force: true` and the caller is super_admin. Prevents premature manual resolution as well.

### 3. Admin visibility

Add a one-shot SQL view `twitter_markets_misaligned` listing rows where `auto_resolve=true AND twitter_metric_type IS NOT NULL AND end_date < auto_resolve_deadline::date`, surfaced in the existing admin Predictions/Markets page so future mismatches are caught before resolution.

## Technical notes

- Affected market IDs:
  - `0eec8a9d-51c4-4242-a521-5d24bac90371`
  - `31dfd76e-c7af-4754-b76b-e27fc38a55ac`
  - `3f2baea2-7704-4cdf-acda-130660470837`
- Refund amounts will be computed from `transactions` (`type='buy' AND side IN ('yes','no')` minus `type='sell' AND side IN ('yes','no')` minus prior `type='refund' AND side IN ('yes','no')`).
- Payout reversal uses `adjust_balance` with negative delta + a compensating `transactions` row (`type='refund'`, `side='payout_reversal'`).
- All balance changes go through `adjust_balance` so debt accounting stays consistent.
- After deploy, the Elon and Instablog9ja markets stay cancelled (their deadlines are still in the future); we won't reopen them, since betting was locked for weeks and that would be unfair. Users will see the void notification and refunded balances.

## Files to change

- New SQL migration: `supabase/migrations/<ts>_void_premature_twitter_resolutions.sql`
- `supabase/functions/fetch-twitter-metrics/index.ts`
- `supabase/functions/check-auto-resolve/index.ts`
- `supabase/functions/close-expired-markets/index.ts`
- `supabase/functions/resolve-market/index.ts`
- The active market-upsert migration (latest of the `upsert_market_*` series, currently `20260411110341_b5432efb…`) — add the `end_date >= auto_resolve_deadline` enforcement.
- Client market-creation form (validation + auto-sync of `end_date` to deadline for Twitter markets).
