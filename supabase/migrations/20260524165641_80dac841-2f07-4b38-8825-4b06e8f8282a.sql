DROP POLICY IF EXISTS "Admins can read all kyc submissions" ON public.kyc_submissions;

CREATE POLICY "Admins and support can read all kyc submissions"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
  );