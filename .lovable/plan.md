

## Plan: Add Limit Orders to Order Book

### Overview
Add a limit order system where traders can place pending buy/sell orders at a specific price. Orders sit in the book until the AMM price reaches their target, at which point they get filled. Traders can cancel unfilled orders anytime.

### Database Changes

**New table: `limit_orders`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `market_id` (uuid, NOT NULL)
- `option_id` (uuid, nullable)
- `side` (text: "yes"/"no")
- `order_type` (text: "limit")
- `limit_price` (numeric, 0.01–0.99 — the target price)
- `amount` (numeric — USDT committed)
- `shares` (numeric — calculated shares at limit price)
- `status` (text: "pending", "filled", "cancelled", "expired")
- `created_at`, `updated_at` (timestamptz)

RLS policies: users can insert/read/update their own orders; admins can read all; public can read pending orders (to display on the order book).

**Realtime**: enable realtime on `limit_orders` for live order book updates.

### Backend: Edge Function for Order Matching

Create `supabase/functions/match-limit-orders/index.ts`:
- Triggered periodically or after each bet via a database trigger on market price updates
- Checks all pending limit orders for a market
- If the current AMM price crosses the limit price, fills the order (deducts balance, creates position, inserts transaction, updates market volume)
- Uses service role key to bypass RLS for cross-user operations

### Frontend Changes

**1. BetModal — Add Order Type Toggle**
- Add a "Market / Limit" toggle at the top of the input step
- **Market order**: current behavior (buy at current AMM price)
- **Limit order**: shows a price input field where the user sets their target price (1¢–99¢). Shares calculated from `amount / (limitPrice)`. On confirm, inserts into `limit_orders` with status "pending" and deducts balance (escrow)

**2. OrderBook — Display Real Limit Orders**
- Fetch pending `limit_orders` for the market
- Overlay real limit order volume onto the synthetic AMM depth levels
- Subscribe to realtime changes on `limit_orders` for live updates

**3. Portfolio — Show Open Orders Tab**
- Add an "Open Orders" tab/section showing the user's pending limit orders
- Each row shows: market title, side, limit price, amount, status
- "Cancel" button on each pending order — sets status to "cancelled" and refunds balance

**4. New hook: `useLimitOrders.ts`**
- `useLimitOrders(marketId)` — fetches pending orders for a market (public)
- `useUserLimitOrders()` — fetches the current user's orders
- `usePlaceLimitOrder()` — mutation to place a limit order (escrow balance)
- `useCancelLimitOrder()` — mutation to cancel and refund

### Order Matching Strategy
- A database trigger on `markets` (AFTER UPDATE on `yes_price`/`no_price`) calls the matching function
- For a "yes" limit buy at price X: fill when `yes_price <= X`
- For a "no" limit buy at price X: fill when `no_price <= X`
- On fill: create position, insert transaction, update market volume, set order status to "filled", notify user

### Files to Create/Edit
| File | Action |
|---|---|
| DB migration (new table + trigger) | Create |
| `supabase/functions/match-limit-orders/index.ts` | Create |
| `src/hooks/useLimitOrders.ts` | Create |
| `src/components/BetModal.tsx` | Edit — add Market/Limit toggle + limit price input |
| `src/components/OrderBook.tsx` | Edit — overlay real limit orders |
| `src/pages/Portfolio.tsx` | Edit — add Open Orders section |
| `src/hooks/useUserBalance.ts` | Edit — escrow logic for limit orders |

