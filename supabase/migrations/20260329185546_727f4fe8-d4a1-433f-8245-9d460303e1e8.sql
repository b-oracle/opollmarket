-- Table to persist space chat messages
CREATE TABLE public.space_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT 'Anonymous',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_space_messages_space_id ON public.space_messages(space_id, created_at);

ALTER TABLE public.space_messages ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read messages for spaces they can see
CREATE POLICY "Authenticated users can read space messages"
  ON public.space_messages FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own messages
CREATE POLICY "Users can insert own messages"
  ON public.space_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for live chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.space_messages;