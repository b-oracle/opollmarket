
-- Allow anyone to read buy/sell transactions (for order book recent trades)
-- This only exposes: id, side, amount, price, shares, created_at, market_id
-- user_id is NOT selected by the OrderBook component
CREATE POLICY "Anyone can read market trades"
  ON public.transactions FOR SELECT
  TO authenticated, anon
  USING (type IN ('buy', 'sell') AND status = 'confirmed');
