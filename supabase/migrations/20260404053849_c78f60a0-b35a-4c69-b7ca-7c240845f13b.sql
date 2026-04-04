-- Drop the buggy policy that causes infinite recursion
DROP POLICY IF EXISTS "Participants can send messages" ON public.dm_messages;

-- Recreate it without the self-referencing subquery bug
CREATE POLICY "Participants can send messages" ON public.dm_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM dm_conversations c
    WHERE c.id = dm_messages.conversation_id
      AND (auth.uid() = c.user_a OR auth.uid() = c.user_b)
      AND (
        c.status = 'active'
        OR (
          c.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM dm_messages existing
            WHERE existing.conversation_id = c.id
              AND existing.sender_id = auth.uid()
          )
        )
      )
  )
);