
-- Fix infinite recursion in spaces UPDATE policy + add DELETE policy + broaden recording playback access.

-- 1. Drop recursive co-host update policy (self-referencing subqueries on `spaces` cause recursion)
DROP POLICY IF EXISTS "Co-hosts can update tagged markets" ON public.spaces;

-- Helper: snapshot original row via SECURITY DEFINER so co-host policy can compare without recursing
CREATE OR REPLACE FUNCTION public.cohost_can_update_space(
  _space_id uuid,
  _new_host uuid,
  _new_status text,
  _new_title text,
  _new_cohosts uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.spaces s
    WHERE s.id = _space_id
      AND auth.uid() = ANY(COALESCE(s.co_host_ids, '{}'::uuid[]))
      AND s.host_id = _new_host
      AND s.status::text = _new_status
      AND s.title = _new_title
      AND NOT (COALESCE(s.co_host_ids,'{}') IS DISTINCT FROM COALESCE(_new_cohosts,'{}'))
  );
$$;

CREATE POLICY "Co-hosts can update non-critical fields"
ON public.spaces
FOR UPDATE
USING (auth.uid() = ANY(COALESCE(co_host_ids, '{}'::uuid[])))
WITH CHECK (
  public.cohost_can_update_space(id, host_id, status::text, title, co_host_ids)
);

-- 2. Ensure host can delete their own spaces
DROP POLICY IF EXISTS "Host can delete own spaces" ON public.spaces;
CREATE POLICY "Host can delete own spaces"
ON public.spaces
FOR DELETE
USING (auth.uid() = host_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 3. Broaden recording playback: anyone who can read the space can read its recording.
DROP POLICY IF EXISTS "Participants can read space recordings" ON storage.objects;
CREATE POLICY "Viewers can read space recordings"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'space-recordings'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.recording_url = objects.name
        AND (
          s.host_id = auth.uid()
          OR s.is_private = false
          OR public.is_space_participant(s.id, auth.uid())
        )
    )
  )
);
