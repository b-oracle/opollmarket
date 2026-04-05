
CREATE OR REPLACE FUNCTION public.cancel_market_atomic(_market_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _market record;
  _refund_count integer;
BEGIN
  -- Lock the market row to prevent concurrent cancellations
  SELECT * INTO _market
  FROM public.markets
  WHERE id = _market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market not found');
  END IF;

  IF _market.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market already cancelled');
  END IF;

  IF _market.status = 'resolved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel a resolved market');
  END IF;

  -- Check for existing refunds/payouts
  SELECT COUNT(*) INTO _refund_count
  FROM public.transactions
  WHERE market_id = _market_id AND type IN ('refund', 'payout');

  IF _refund_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market already has refund/payout transactions');
  END IF;

  -- Atomically set status to cancelled to prevent concurrent processing
  UPDATE public.markets SET status = 'cancelled' WHERE id = _market_id;

  RETURN jsonb_build_object('success', true, 'previous_status', _market.status);
END;
$$;
