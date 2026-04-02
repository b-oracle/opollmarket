
-- Drop the security definer views
DROP VIEW IF EXISTS public.order_book_entries;
DROP VIEW IF EXISTS public.market_trades_anonymous;

-- Add back scoped read policies on the underlying tables
-- These only allow reading specific rows, and the code will select only safe columns
CREATE POLICY "Authenticated can read pending limit orders for orderbook" ON public.limit_orders
  FOR SELECT TO authenticated
  USING (status = 'pending');

CREATE POLICY "Authenticated can read confirmed market trades" ON public.transactions
  FOR SELECT TO authenticated
  USING (type IN ('buy', 'sell') AND status = 'confirmed');
