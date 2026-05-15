
-- Fix 1: spaces SELECT policy — require non-private for follower-network branch
DROP POLICY IF EXISTS "Users can read own and network spaces" ON public.spaces;

CREATE POLICY "Users can read own and network spaces"
ON public.spaces
FOR SELECT
TO public
USING (
  (auth.uid() = host_id)
  OR (
    is_private = false
    AND EXISTS (
      SELECT 1 FROM follows f
      WHERE ((f.follower_id = auth.uid() AND f.following_id = spaces.host_id)
         OR (f.follower_id = spaces.host_id AND f.following_id = auth.uid()))
    )
  )
  OR is_space_participant(id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM space_invites si
    WHERE si.space_id = spaces.id AND si.invitee_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Fix 2: notification_email_outbox — explicitly deny client-side writes.
-- All inserts must go through SECURITY DEFINER RPCs / service role.
DROP POLICY IF EXISTS "Deny client inserts on email outbox" ON public.notification_email_outbox;
CREATE POLICY "Deny client inserts on email outbox"
ON public.notification_email_outbox
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client updates on email outbox" ON public.notification_email_outbox;
CREATE POLICY "Deny client updates on email outbox"
ON public.notification_email_outbox
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client deletes on email outbox" ON public.notification_email_outbox;
CREATE POLICY "Deny client deletes on email outbox"
ON public.notification_email_outbox
FOR DELETE
TO authenticated, anon
USING (false);
