CREATE POLICY "Admins can read all whatsapp users"
ON public.whatsapp_users
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Super admins can read all whatsapp users"
ON public.whatsapp_users
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));