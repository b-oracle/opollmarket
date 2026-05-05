CREATE POLICY "Participants can delete own conversations"
  ON public.dm_conversations FOR DELETE
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Participants can delete messages in own conversations"
  ON public.dm_messages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.dm_conversations c
    WHERE c.id = dm_messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  ));