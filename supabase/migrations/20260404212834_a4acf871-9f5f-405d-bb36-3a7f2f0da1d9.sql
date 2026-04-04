
-- Create a SECURITY DEFINER helper to check participation without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_space_participant(_space_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_participants
    WHERE space_id = _space_id
      AND user_id = _user_id
      AND left_at IS NULL
  );
$$;

-- Drop the old recursive policy
DROP POLICY IF EXISTS "Authenticated can read space participants" ON public.space_participants;

-- Create the fixed policy using the SECURITY DEFINER function
CREATE POLICY "Authenticated can read space participants"
ON public.space_participants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM spaces s
    WHERE s.id = space_participants.space_id
      AND (
        s.host_id = auth.uid()
        OR auth.uid() = ANY(s.co_host_ids)
        OR s.is_private = false
        OR public.is_space_participant(s.id, auth.uid())
      )
  )
);
