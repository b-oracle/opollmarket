
-- Drop ALL existing policies on commission_settings
DROP POLICY IF EXISTS "Admins can update commission settings" ON public.commission_settings;
DROP POLICY IF EXISTS "Authenticated users can read commission settings" ON public.commission_settings;

-- Recreate as explicitly PERMISSIVE
CREATE POLICY "Anyone can read commission settings"
ON public.commission_settings
AS PERMISSIVE
FOR SELECT
TO public
USING (true);

CREATE POLICY "Admins can update commission settings"
ON public.commission_settings
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
