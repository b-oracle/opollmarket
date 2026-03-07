
-- Drop the restrictive insert policy and replace with one that allows all authenticated admin/moderator users
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;

CREATE POLICY "Admin roles can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role) OR
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'moderator'::app_role)
);
