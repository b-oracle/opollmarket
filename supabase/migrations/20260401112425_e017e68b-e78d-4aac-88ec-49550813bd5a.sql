-- Drop the overly permissive creator update policy
DROP POLICY IF EXISTS "Creators can update own markets" ON public.markets;

-- Create a restricted policy: creators can only update non-financial fields
-- The WITH CHECK ensures they cannot change price/volume/liquidity/status fields
CREATE POLICY "Creators can update own markets (restricted)"
ON public.markets
FOR UPDATE
TO authenticated
USING ((auth.uid())::text = creator_wallet)
WITH CHECK (
  (auth.uid())::text = creator_wallet
  -- Block changes to financial/integrity fields by ensuring they match current values
  AND yes_price = (SELECT m.yes_price FROM public.markets m WHERE m.id = markets.id)
  AND no_price = (SELECT m.no_price FROM public.markets m WHERE m.id = markets.id)
  AND volume = (SELECT m.volume FROM public.markets m WHERE m.id = markets.id)
  AND liquidity = (SELECT m.liquidity FROM public.markets m WHERE m.id = markets.id)
  AND initial_liquidity = (SELECT m.initial_liquidity FROM public.markets m WHERE m.id = markets.id)
  AND participants = (SELECT m.participants FROM public.markets m WHERE m.id = markets.id)
  AND status = (SELECT m.status FROM public.markets m WHERE m.id = markets.id)
  AND resolved_side = (SELECT m.resolved_side FROM public.markets m WHERE m.id = markets.id)
  AND winning_option_id = (SELECT m.winning_option_id FROM public.markets m WHERE m.id = markets.id)
  AND simulated_volume = (SELECT m.simulated_volume FROM public.markets m WHERE m.id = markets.id)
  AND simulated_participants = (SELECT m.simulated_participants FROM public.markets m WHERE m.id = markets.id)
  AND trending = (SELECT m.trending FROM public.markets m WHERE m.id = markets.id)
  AND pinned_trending = (SELECT m.pinned_trending FROM public.markets m WHERE m.id = markets.id)
  AND blockchain_tx_hash = (SELECT m.blockchain_tx_hash FROM public.markets m WHERE m.id = markets.id)
  AND liquidity_verified = (SELECT m.liquidity_verified FROM public.markets m WHERE m.id = markets.id)
);