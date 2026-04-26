-- Lifecycle event log for DM voice/video calls
CREATE TABLE public.dm_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL,
  conversation_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'received','accepted','declined','joined','ended','failed','missed','rejoin','timeout','cancelled'
  )),
  actor_id uuid,
  source text NOT NULL DEFAULT 'client' CHECK (source IN ('client','edge','trigger','admin')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dm_call_events_call_id ON public.dm_call_events(call_id);
CREATE INDEX idx_dm_call_events_created_at ON public.dm_call_events(created_at DESC);
CREATE INDEX idx_dm_call_events_conversation_id ON public.dm_call_events(conversation_id);

ALTER TABLE public.dm_call_events ENABLE ROW LEVEL SECURITY;

-- Admins / support can see all events
CREATE POLICY "Admins can view all call events"
  ON public.dm_call_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'support')
  );

-- Participants of the call can see their own call events
CREATE POLICY "Participants can view their call events"
  ON public.dm_call_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_calls c
      WHERE c.id = dm_call_events.call_id
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );

-- Authenticated participants can insert events for their own calls
CREATE POLICY "Participants can insert their call events"
  ON public.dm_call_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dm_calls c
      WHERE c.id = dm_call_events.call_id
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );

-- Admins can insert administrative events (e.g., manual notes)
CREATE POLICY "Admins can insert call events"
  ON public.dm_call_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Helper RPC: log an event with permission checks (used by the client)
CREATE OR REPLACE FUNCTION public.log_dm_call_event(
  _call_id uuid,
  _event_type text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _conv_id uuid;
  _event_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is a participant; also fetch conversation_id
  SELECT conversation_id INTO _conv_id
  FROM dm_calls
  WHERE id = _call_id
    AND (caller_id = _user_id OR callee_id = _user_id);

  IF _conv_id IS NULL THEN
    RAISE EXCEPTION 'Not a participant of this call';
  END IF;

  INSERT INTO dm_call_events (
    call_id, conversation_id, event_type, actor_id, source, metadata
  ) VALUES (
    _call_id, _conv_id, _event_type, _user_id, 'client', COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;