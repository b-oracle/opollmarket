CREATE OR REPLACE FUNCTION public.cancel_market_atomic(_market_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _market record;
  _refund_count integer;
  _open_positions integer;
BEGIN
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

  -- Count open exposure (positions still holding shares)
  SELECT COUNT(*) INTO _open_positions
  FROM public.positions
  WHERE market_id = _market_id AND shares > 0;

  -- Existing refunds/payouts only block cancellation when open exposure remains,
  -- i.e. when re-running the refund loop could double-pay a holder.
  IF _open_positions > 0 THEN
    SELECT COUNT(*) INTO _refund_count
    FROM public.transactions t
    WHERE t.market_id = _market_id
      AND t.type IN ('refund', 'payout')
      AND EXISTS (
        SELECT 1 FROM public.positions p
        WHERE p.market_id = _market_id
          AND p.shares > 0
          AND p.user_id = t.user_id
      );

    IF _refund_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Open positions in this market were already refunded/paid out — resolve manually to avoid double payment');
    END IF;
  END IF;

  UPDATE public.markets SET status = 'cancelled' WHERE id = _market_id;

  RETURN jsonb_build_object(
    'success', true,
    'previous_status', _market.status,
    'open_positions', _open_positions
  );
END;
$$;