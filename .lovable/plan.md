

# Fix: Display Correct Labels for Non-Trade Transactions in Order Book

## Problem
Fee and liquidity transactions are stored with `type = 'buy'` but use the `side` column for their purpose label (e.g. `initial_liquidity`, `broadcast_fee`, `auto_resolve_fee`, `liquidity_return`). The OrderBook query fetches all `type IN ('buy', 'sell')` rows, and the UI checks `side === "yes"` — anything else renders as "NO" with a red icon, which is misleading.

## Solution
Two options — I recommend **Option A** (filter them out) since these aren't real trades:

**Option A: Filter out non-trade transactions from Recent Trades**
Add a filter to exclude rows where `side` is not `yes` or `no`. These operational transactions aren't predictions and shouldn't appear in the trade tape.

**Option B: Show them with proper labels**
Keep them visible but render `initial_liquidity` as "Liquidity", `broadcast_fee` as "Broadcast Fee", etc.

## Recommended Approach (Option A + partial B)
- Filter the query to only return actual trades: add `.in("side", ["yes", "no"])` to the Supabase query
- This removes liquidity deposits, fee charges, and refunds from the trade tape — they belong in the full transaction history, not the order book

## File Modified
- `src/components/OrderBook.tsx` — add `.in("side", ["yes", "no"])` filter to the recent trades query (line ~47)

