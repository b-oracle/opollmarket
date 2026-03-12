
-- Allow creators to update their own markets (for draft save/resume)
CREATE POLICY "Creators can update own markets"
ON public.markets
FOR UPDATE
TO authenticated
USING ((auth.uid())::text = creator_wallet)
WITH CHECK ((auth.uid())::text = creator_wallet);

-- Allow creators to delete their own draft markets
CREATE POLICY "Creators can delete own draft markets"
ON public.markets
FOR DELETE
TO authenticated
USING ((auth.uid())::text = creator_wallet AND status = 'draft');

-- Allow authenticated users to insert market options for their own markets
CREATE POLICY "Creators can insert own market options"
ON public.market_options
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.markets
    WHERE markets.id = market_id
    AND markets.creator_wallet = (auth.uid())::text
  )
);

-- Allow creators to delete market options for their own draft markets
CREATE POLICY "Creators can delete own draft market options"
ON public.market_options
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.markets
    WHERE markets.id = market_id
    AND markets.creator_wallet = (auth.uid())::text
    AND markets.status = 'draft'
  )
);
