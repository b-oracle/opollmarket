CREATE POLICY "Super admins can delete audit logs"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));