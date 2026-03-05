
-- Drop restrictive policies on commission_settings
DROP POLICY IF EXISTS "Admins can update commission settings" ON public.commission_settings;
DROP POLICY IF EXISTS "Authenticated users can read commission settings" ON public.commission_settings;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Authenticated users can read commission settings"
ON public.commission_settings FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Admins can update commission settings"
ON public.commission_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
