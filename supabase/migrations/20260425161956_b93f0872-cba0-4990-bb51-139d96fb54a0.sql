-- Inbound webhook failure log: tracks failed IPN handler attempts
-- (NOWPayments, Flutterwave, Payaza, etc.) for retry orchestration.
-- Distinct from `webhook_events` which logs OUTBOUND webhook deliveries to API partners.

CREATE TABLE IF NOT EXISTS public.webhook_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  user_id uuid,
  transaction_id uuid,
  external_reference text,
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  last_stack text,
  next_run_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT webhook_failures_unique_event UNIQUE (provider, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_due
  ON public.webhook_failures (next_run_at)
  WHERE status IN ('pending', 'retrying') AND next_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_failures_provider_status
  ON public.webhook_failures (provider, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_transaction
  ON public.webhook_failures (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_failures_user
  ON public.webhook_failures (user_id) WHERE user_id IS NOT NULL;

-- Local updated_at trigger fn (project-scoped to avoid touching shared helpers)
CREATE OR REPLACE FUNCTION public.touch_webhook_failures_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_webhook_failures_updated_at
  BEFORE UPDATE ON public.webhook_failures
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_webhook_failures_updated_at();

ALTER TABLE public.webhook_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook failures"
  ON public.webhook_failures
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Upsert by (provider, payload_hash). Bumps attempts on duplicates and
-- preserves any user/transaction context that was learned on earlier attempts.
CREATE OR REPLACE FUNCTION public.record_webhook_failure(
  _provider text,
  _payload_hash text,
  _payload jsonb,
  _event_type text DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _transaction_id uuid DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _error text DEFAULT NULL,
  _stack text DEFAULT NULL,
  _next_run_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.webhook_failures (
    provider, payload_hash, payload, event_type,
    user_id, transaction_id, external_reference,
    last_error, last_stack, next_run_at, status, attempts
  )
  VALUES (
    _provider, _payload_hash, _payload, _event_type,
    _user_id, _transaction_id, _external_reference,
    _error, _stack, _next_run_at, 'pending', 1
  )
  ON CONFLICT (provider, payload_hash) DO UPDATE
    SET attempts           = public.webhook_failures.attempts + 1,
        last_error         = COALESCE(EXCLUDED.last_error, public.webhook_failures.last_error),
        last_stack         = COALESCE(EXCLUDED.last_stack, public.webhook_failures.last_stack),
        next_run_at        = COALESCE(EXCLUDED.next_run_at, public.webhook_failures.next_run_at),
        status             = CASE
                               WHEN public.webhook_failures.status = 'resolved' THEN 'resolved'
                               ELSE 'retrying'
                             END,
        updated_at         = now(),
        user_id            = COALESCE(public.webhook_failures.user_id, EXCLUDED.user_id),
        transaction_id     = COALESCE(public.webhook_failures.transaction_id, EXCLUDED.transaction_id),
        external_reference = COALESCE(public.webhook_failures.external_reference, EXCLUDED.external_reference)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_webhook_failure(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.webhook_failures
  SET status = 'resolved',
      resolved_at = now(),
      next_run_at = NULL,
      updated_at = now()
  WHERE id = _id;
  RETURN FOUND;
END;
$$;