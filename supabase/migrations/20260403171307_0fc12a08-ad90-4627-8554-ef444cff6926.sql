-- Atomic market claim for resolution (prevents concurrent double-resolve)
CREATE OR REPLACE FUNCTION public.claim_market_for_resolution(_market_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status text;
  _resolved_side text;
  _winning_option_id uuid;
BEGIN
  SELECT status, resolved_side, winning_option_id
  INTO _status, _resolved_side, _winning_option_id
  FROM markets
  WHERE id = _market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market not found');
  END IF;

  IF _status = 'resolved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market already resolved');
  END IF;

  IF _resolved_side IS NOT NULL OR _winning_option_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market has prior resolution data');
  END IF;

  -- Check for existing payouts
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE market_id = _market_id AND type IN ('payout', 'refund')
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market already has payout/refund transactions');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Withdrawal idempotency
ALTER TABLE public.withdrawal_requests
ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawal_requests_idempotency
ON public.withdrawal_requests (idempotency_key)
WHERE idempotency_key IS NOT NULL;