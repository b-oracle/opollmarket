
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read space messages" ON public.space_messages;

-- Create a restrictive policy: only participants, hosts, or public-space viewers
CREATE POLICY "Authenticated users can read space messages"
  ON public.space_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_space_participant(space_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.spaces s
      WHERE s.id = space_messages.space_id
        AND (s.host_id = auth.uid() OR s.is_private = false)
    )
  );
