DROP POLICY IF EXISTS "Boosts readable by owner or admin" ON public.market_boosts;
CREATE POLICY "Active boosts publicly readable" ON public.market_boosts FOR SELECT USING (true);