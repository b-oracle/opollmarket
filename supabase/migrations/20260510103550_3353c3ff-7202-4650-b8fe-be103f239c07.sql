DROP POLICY IF EXISTS "Markets are publicly readable" ON public.markets;

CREATE POLICY "Markets are publicly readable"
ON public.markets
FOR SELECT
TO public
USING (
  participants > 0
  OR is_crypto_round = true
  OR (auth.uid())::text = creator_wallet
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
);