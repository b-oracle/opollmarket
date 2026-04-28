-- Add retry scheduling columns to webhook_events
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Index for the retry scheduler to pick up due rows fast
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
  ON public.webhook_events (status, next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Admin RPC: requeue a failed webhook event for immediate retry
CREATE OR REPLACE FUNCTION public.requeue_webhook_event(_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL
     OR (NOT public.has_role(_caller, 'admin')
         AND NOT public.has_role(_caller, 'super_admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.webhook_events
  SET status = 'failed',
      next_retry_at = now(),
      last_error = COALESCE(last_error, '') || E'\n[manual requeue by admin]'
  WHERE id = _event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;