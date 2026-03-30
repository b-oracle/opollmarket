

# Fix: Return Creator Liquidity on Auto-Resolution

## Problem
The `check-auto-resolve` edge function resolves markets and pays winners but **never returns the creator's initial liquidity**. The manual `resolve-market` function does this correctly (lines 344-383). This means every auto-resolved market's creator loses their initial liquidity.

The Elon Musk tweet market creator (`cef65e17-...`) put up $100 in initial liquidity that was never returned.

## Fix

### File: `supabase/functions/check-auto-resolve/index.ts`

Add a reusable helper function `returnCreatorLiquidity(adminClient, market)` that:

1. Checks `market.initial_liquidity > 0` and `market.liquidity_verified === true`
2. Fetches `liquidity_return_fee_percent` from `commission_settings`
3. Calculates refund = `initial_liquidity - (initial_liquidity * fee%/100)`
4. Credits creator via `adjust_balance` RPC
5. Records a `refund` transaction with `side: 'liquidity_return'`
6. Sends a notification to the creator

Then call this helper in **three places** where markets get resolved:
- After the standard crypto/commodity/forex resolution loop (~line 434)
- After binary Twitter resolution (~line 570)
- After multi-option Twitter resolution (~line 660)

### One-time fix for the Elon Musk market

Run a migration to credit the creator's liquidity refund for `e153f4cd-...`:
- $100 initial liquidity minus 10% fee = **$90 refund**
- Insert a `liquidity_return` transaction
- Credit balance via `adjust_balance`
- Send notification

### Files Modified
- `supabase/functions/check-auto-resolve/index.ts` — add liquidity return helper + 3 call sites
- New migration — one-time fix for the already-resolved market

