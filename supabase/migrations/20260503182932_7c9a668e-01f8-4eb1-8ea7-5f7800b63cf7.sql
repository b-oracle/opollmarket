DROP POLICY IF EXISTS "Hosts and co-hosts can remove bans" ON public.space_bans;
CREATE POLICY "Hosts cohosts and admins can remove bans"
ON public.space_bans
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.spaces s
    WHERE s.id = space_bans.space_id
      AND (s.host_id = auth.uid() OR auth.uid() = ANY (s.co_host_ids))
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);