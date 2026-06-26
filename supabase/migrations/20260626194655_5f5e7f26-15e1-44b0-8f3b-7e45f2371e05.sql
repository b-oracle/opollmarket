-- Restrict platform_stats_overrides: drop public read, keep super_admin manage.
DROP POLICY IF EXISTS "Anyone can read overrides" ON public.platform_stats_overrides;

CREATE POLICY "Admins can read overrides"
ON public.platform_stats_overrides
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

REVOKE SELECT ON public.platform_stats_overrides FROM anon;