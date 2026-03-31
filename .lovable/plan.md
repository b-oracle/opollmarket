

# Move Sell/Cashout to Server-Side Edge Function

## Problem

The entire sell/cashout flow runs client-side in `Portfolio.tsx` (lines 418-513): position update, balance credit, market liquidity reduction, and transaction recording are all separate Supabase calls from the browser. This is insecure — a user could manipulate prices, skip fee deduction, or double-sell.

## Solution

Create a `sell-position` edge function that performs all operations atomically server-side, including AMM price recalculation (mirroring the inverse of the buy logic in `place-bet`).

## Technical Changes

### 1. New file: `supabase/functions/sell-position/index.ts`

**Inputs:** `{ positionId }`

**Server-side logic (atomic):**
1. Authenticate user via JWT
2. Fetch position (verify ownership, shares > 0, market is active)
3. Fetch market (yes_price, no_price, volume, liquidity, market_type)
4. For multi/range: fetch option price from `market_options`
5. Fetch `exit_fee_percent` from `commission_settings`
6. Calculate `grossProceeds = shares × currentPrice`, `exitFee`, `netProceeds`
7. Fetch user balance, use bonus first for fee (same pattern as place-bet)
8. **Atomic operations:**
   - Zero out position shares
   - Credit balance via `adjust_balance` RPC (net proceeds to main, deduct bonus for fee)
   - Credit exit fee to platform pool via `adjust_platform_pool`
   - Update market: increment volume, decrement liquidity
   - **AMM price recalculation** (inverse of buy): selling YES pushes yes_price down, selling NO pushes yes_price up. For multi/range, rebalance option prices.
   - Insert sell transaction
9. Return `{ success, netProceeds, exitFee, newPrice }`

**AMM recalculation logic** (mirrors `place-bet` lines 393-446 but inverted):
- Binary: `impact = min(grossProceeds / totalLiquidity, 0.15)`. If selling YES → `newYes = max(0.01, currentYes - impact)`. If selling NO → `newYes = min(0.99, currentYes + impact)`.
- Multi/Range: decrease sold option price, scale others up proportionally.

### 2. Update `supabase/config.toml`

Add `verify_jwt = false` for `sell-position`.

### 3. Update `src/pages/Portfolio.tsx`

Replace the `executeSell` callback (lines 418-513) to invoke the edge function:

```typescript
const { data, error } = await supabase.functions.invoke("sell-position", {
  body: { positionId: sellTarget.id },
});
```

Remove all direct DB calls (position update, balance update, market update, transaction insert). Keep the UI flow (confirm → executing → success/error) and win celebration modal.

## Summary
- 1 new edge function: `supabase/functions/sell-position/index.ts`
- 1 config line added to `supabase/config.toml`
- 1 file updated: `src/pages/Portfolio.tsx` (simplify `executeSell` to single function invoke)
- No database migrations needed

