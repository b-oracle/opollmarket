CREATE POLICY "Admins can view all escrows"
ON public.creation_fee_escrows
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);