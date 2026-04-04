
-- Create dm_calls table
CREATE TABLE public.dm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'declined')),
  room_name TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.dm_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own calls"
  ON public.dm_calls FOR SELECT
  TO authenticated
  USING (caller_id = auth.uid() OR callee_id = auth.uid());

CREATE POLICY "Users can insert calls they initiate"
  ON public.dm_calls FOR INSERT
  TO authenticated
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Users can update their own calls"
  ON public.dm_calls FOR UPDATE
  TO authenticated
  USING (caller_id = auth.uid() OR callee_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_calls;

-- Index for fast lookup
CREATE INDEX idx_dm_calls_callee_status ON public.dm_calls (callee_id, status);
CREATE INDEX idx_dm_calls_conversation ON public.dm_calls (conversation_id);
