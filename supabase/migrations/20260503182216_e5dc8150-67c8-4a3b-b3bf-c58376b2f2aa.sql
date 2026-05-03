CREATE TABLE IF NOT EXISTS public.space_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  banned_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_space_bans_space ON public.space_bans(space_id);
CREATE INDEX IF NOT EXISTS idx_space_bans_user ON public.space_bans(user_id);

ALTER TABLE public.space_bans ENABLE ROW LEVEL SECURITY;

-- Hosts / co-hosts of the space can manage bans
CREATE POLICY "Hosts and co-hosts can view bans"
ON public.space_bans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.spaces s
    WHERE s.id = space_bans.space_id
      AND (s.host_id = auth.uid() OR auth.uid() = ANY (s.co_host_ids))
  )
  OR user_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Hosts and co-hosts can create bans"
ON public.space_bans
FOR INSERT
TO authenticated
WITH CHECK (
  banned_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.spaces s
    WHERE s.id = space_bans.space_id
      AND (s.host_id = auth.uid() OR auth.uid() = ANY (s.co_host_ids))
  )
);

CREATE POLICY "Hosts and co-hosts can remove bans"
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
);