DROP POLICY IF EXISTS "Users can create spaces" ON public.spaces;

CREATE POLICY "Verified users can create spaces"
ON public.spaces
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = host_id
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.verification_level IN ('blue', 'gold')
    )
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);