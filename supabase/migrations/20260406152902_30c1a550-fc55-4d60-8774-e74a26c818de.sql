
-- FIX 1: support_messages UPDATE — restrict to reactions only
DROP POLICY IF EXISTS "Users can update support messages they can view" ON public.support_messages;
DROP POLICY IF EXISTS "Users can update support message reactions only" ON public.support_messages;

CREATE POLICY "Users can update support message reactions only"
ON public.support_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM support_tickets t
    WHERE t.id = support_messages.ticket_id
    AND (
      t.user_id = auth.uid()
      OR has_role(auth.uid(), 'support')
      OR has_role(auth.uid(), 'moderator')
      OR has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'super_admin')
    )
  )
)
WITH CHECK (
  content = (SELECT m.content FROM support_messages m WHERE m.id = support_messages.id)
  AND user_id = (SELECT m.user_id FROM support_messages m WHERE m.id = support_messages.id)
  AND is_staff = (SELECT m.is_staff FROM support_messages m WHERE m.id = support_messages.id)
  AND ticket_id = (SELECT m.ticket_id FROM support_messages m WHERE m.id = support_messages.id)
  AND NOT (image_url IS DISTINCT FROM (SELECT m.image_url FROM support_messages m WHERE m.id = support_messages.id))
  AND NOT (is_ai IS DISTINCT FROM (SELECT m.is_ai FROM support_messages m WHERE m.id = support_messages.id))
  AND NOT (reply_to_id IS DISTINCT FROM (SELECT m.reply_to_id FROM support_messages m WHERE m.id = support_messages.id))
);

-- FIX 2: space_messages UPDATE — restrict to reactions only (no image_url column)
DROP POLICY IF EXISTS "Users can update message reactions in their spaces" ON public.space_messages;
DROP POLICY IF EXISTS "Users can update space message reactions only" ON public.space_messages;

CREATE POLICY "Users can update space message reactions only"
ON public.space_messages
FOR UPDATE
TO authenticated
USING (
  is_space_participant(space_id, auth.uid()) OR user_id = auth.uid()
)
WITH CHECK (
  content = (SELECT m.content FROM space_messages m WHERE m.id = space_messages.id)
  AND user_id = (SELECT m.user_id FROM space_messages m WHERE m.id = space_messages.id)
  AND space_id = (SELECT m.space_id FROM space_messages m WHERE m.id = space_messages.id)
);

-- FIX 3: dm_messages "mark as read" — restrict to only read_at
DROP POLICY IF EXISTS "Users can mark received messages as read" ON public.dm_messages;

CREATE POLICY "Users can mark received messages as read"
ON public.dm_messages
FOR UPDATE
TO authenticated
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
  AND content = (SELECT m.content FROM dm_messages m WHERE m.id = dm_messages.id)
  AND sender_id = (SELECT m.sender_id FROM dm_messages m WHERE m.id = dm_messages.id)
  AND conversation_id = (SELECT m.conversation_id FROM dm_messages m WHERE m.id = dm_messages.id)
  AND NOT (gift_amount IS DISTINCT FROM (SELECT m.gift_amount FROM dm_messages m WHERE m.id = dm_messages.id))
  AND NOT (reactions IS DISTINCT FROM (SELECT m.reactions FROM dm_messages m WHERE m.id = dm_messages.id))
);
