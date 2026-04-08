-- Drop and recreate the spaces SELECT policy to include participants and invitees
DROP POLICY IF EXISTS "Users can read own and network spaces" ON public.spaces;

CREATE POLICY "Users can read own and network spaces"
ON public.spaces
FOR SELECT
USING (
  auth.uid() = host_id
  OR EXISTS (
    SELECT 1 FROM follows f
    WHERE (f.follower_id = auth.uid() AND f.following_id = spaces.host_id)
       OR (f.follower_id = spaces.host_id AND f.following_id = auth.uid())
  )
  OR is_space_participant(id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM space_invites si
    WHERE si.space_id = spaces.id AND si.invitee_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);