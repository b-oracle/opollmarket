-- Fix market_boosts INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create boosts" ON public.market_boosts;

CREATE POLICY "Authenticated users can create boosts"
ON public.market_boosts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = payer_wallet);