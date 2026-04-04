DROP POLICY IF EXISTS "Users can update message reactions in their spaces"
  ON public.space_messages;

CREATE POLICY "Users can update message reactions in their spaces"
ON public.space_messages FOR UPDATE TO authenticated
USING (
  public.is_space_participant(space_id, auth.uid())
  OR user_id = auth.uid()
)
WITH CHECK (
  public.is_space_participant(space_id, auth.uid())
  OR user_id = auth.uid()
);