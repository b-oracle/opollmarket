
ALTER TABLE public.space_messages ADD COLUMN reactions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE POLICY "Users can update own message reactions"
ON public.space_messages
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
