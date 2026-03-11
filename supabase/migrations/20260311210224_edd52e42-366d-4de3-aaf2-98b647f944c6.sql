
-- Drop existing public read policy
DROP POLICY IF EXISTS "Markets are publicly readable" ON public.markets;

-- New policy: markets only visible publicly after creator places first bet (participants > 0)
-- Creator, super_admin, admin, and moderator can always see all markets
CREATE POLICY "Markets are publicly readable" ON public.markets
FOR SELECT TO public
USING (
  participants > 0
  OR (auth.uid())::text = creator_wallet
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
);
