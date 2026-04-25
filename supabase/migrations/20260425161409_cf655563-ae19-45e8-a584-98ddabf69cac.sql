-- ────────────────────────────────────────────────────────────────────
-- Idempotent NOWPayments webhook helpers
-- ────────────────────────────────────────────────────────────────────

-- 1. Webhook event ledger: deduplicates raw IPN events by (provider, event_key)
--    where event_key is provider-specific (e.g. payment_id + payment_status).
--    Insert succeeds once; duplicates raise unique_violation which the function
--    handler treats as "already processed".
CREATE TABLE IF NOT EXISTS public.webhook_event_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_key text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  CONSTRAINT webhook_event_ledger_unique UNIQUE (provider, event_key)
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_ledger_first_seen
  ON public.webhook_event_ledger (first_seen_at DESC);

ALTER TABLE public.webhook_event_ledger ENABLE ROW LEVEL SECURITY;

-- Only admins/super_admins can read; writes happen via service role only.
CREATE POLICY "Admins can view webhook event ledger"
  ON public.webhook_event_ledger
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2. Returns true if this is the first time we've seen (provider, event_key);
--    false if it's a duplicate. Service-role-callable.
CREATE OR REPLACE FUNCTION public.record_webhook_event(
  _provider text,
  _event_key text,
  _payload jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.webhook_event_ledger (provider, event_key, payload)
  VALUES (_provider, _event_key, _payload);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

-- 3. Atomic claim for boost activation — flips a single boost row from
--    pending/expired to active, returning the claimed row. Concurrent
--    duplicate IPNs will see no row returned.
CREATE OR REPLACE FUNCTION public.claim_webhook_boost(
  _payment_id text,
  _market_id uuid,
  _payer uuid
)
RETURNS TABLE(id uuid, ends_at timestamptz, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- First try by exact payment_id
  RETURN QUERY
  UPDATE public.market_boosts mb
  SET status = 'processing'
  WHERE mb.id = (
    SELECT id FROM public.market_boosts
    WHERE nowpayments_payment_id = _payment_id
      AND status IN ('pending', 'expired')
    LIMIT 1
  )
  RETURNING mb.id, mb.ends_at, mb.status;

  IF FOUND THEN RETURN; END IF;

  -- Fallback: pending/expired boost on same market by same payer
  RETURN QUERY
  UPDATE public.market_boosts mb
  SET status = 'processing',
      nowpayments_payment_id = _payment_id
  WHERE mb.id = (
    SELECT id FROM public.market_boosts
    WHERE market_id = _market_id
      AND payer_wallet = _payer::text
      AND status IN ('pending', 'expired')
    ORDER BY created_at DESC
    LIMIT 1
  )
  RETURNING mb.id, mb.ends_at, mb.status;
END;
$$;

-- 4. Atomic claim for broadcast — flips pending/expired to processing.
CREATE OR REPLACE FUNCTION public.claim_webhook_broadcast(
  _payment_id text,
  _market_id uuid,
  _user_id uuid
)
RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.market_broadcasts mb
  SET status = 'processing'
  WHERE mb.id = (
    SELECT id FROM public.market_broadcasts
    WHERE nowpayments_payment_id = _payment_id
      AND status IN ('pending', 'expired')
    LIMIT 1
  )
  RETURNING mb.id, mb.status;

  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  UPDATE public.market_broadcasts mb
  SET status = 'processing',
      nowpayments_payment_id = _payment_id
  WHERE mb.id = (
    SELECT id FROM public.market_broadcasts
    WHERE market_id = _market_id
      AND user_id = _user_id
      AND status IN ('pending', 'expired')
    ORDER BY created_at DESC
    LIMIT 1
  )
  RETURNING mb.id, mb.status;
END;
$$;

-- 5. Auto-cleanup: drop ledger entries older than 60 days
CREATE OR REPLACE FUNCTION public.cleanup_webhook_event_ledger()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.webhook_event_ledger
  WHERE first_seen_at < now() - interval '60 days';
$$;