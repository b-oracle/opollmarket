
-- Fix space_participants: restrict from public to authenticated + scoped
DROP POLICY IF EXISTS "Anyone can read space participants" ON public.space_participants;
CREATE POLICY "Authenticated can read space participants"
  ON public.space_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM spaces s
      WHERE s.id = space_participants.space_id
        AND (
          s.host_id = auth.uid()
          OR auth.uid() = ANY(s.co_host_ids)
          OR s.is_private = false
          OR EXISTS (SELECT 1 FROM space_participants sp2 WHERE sp2.space_id = s.id AND sp2.user_id = auth.uid())
        )
    )
  );

-- Fix dm_messages: change UPDATE policy from public to authenticated
DROP POLICY IF EXISTS "Users can mark received messages as read" ON public.dm_messages;
CREATE POLICY "Users can mark received messages as read"
  ON public.dm_messages FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = dm_messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = dm_messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );
