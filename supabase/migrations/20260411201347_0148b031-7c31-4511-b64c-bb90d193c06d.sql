
-- Create a helper to check if user can read a space invite (avoids recursion)
CREATE OR REPLACE FUNCTION public.can_read_space_invite(_inviter_id uuid, _invitee_id uuid, _space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    _inviter_id = auth.uid()
    OR _invitee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM spaces s WHERE s.id = _space_id AND s.host_id = auth.uid()
    )
  );
$$;

-- Create a helper to check if user can invite to a space
CREATE OR REPLACE FUNCTION public.can_invite_to_space(_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM spaces s
    WHERE s.id = _space_id
      AND (s.host_id = auth.uid() OR auth.uid() = ANY(COALESCE(s.co_host_ids, '{}'::uuid[])))
  );
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Participants can read invites" ON space_invites;
DROP POLICY IF EXISTS "Host or cohost can invite" ON space_invites;

-- Recreate SELECT policy using helper function
CREATE POLICY "Participants can read invites"
ON space_invites FOR SELECT
USING (public.can_read_space_invite(inviter_id, invitee_id, space_id));

-- Recreate INSERT policy using helper function
CREATE POLICY "Host or cohost can invite"
ON space_invites FOR INSERT
WITH CHECK (inviter_id = auth.uid() AND public.can_invite_to_space(space_id));
