
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow participants to update reactions on any message in their conversation
DROP POLICY IF EXISTS "Users can update reactions on conversation messages" ON public.dm_messages;
CREATE POLICY "Users can update reactions on conversation messages"
ON public.dm_messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM dm_conversations c
    WHERE c.id = dm_messages.conversation_id
    AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM dm_conversations c
    WHERE c.id = dm_messages.conversation_id
    AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
  AND content = content
  AND NOT (gift_amount IS DISTINCT FROM gift_amount)
  AND sender_id = sender_id
  AND conversation_id = conversation_id
);
