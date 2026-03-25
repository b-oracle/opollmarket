
CREATE OR REPLACE FUNCTION public.add_market_liquidity(
  _user_id uuid,
  _market_id uuid,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _bal numeric;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT amount INTO _bal FROM balances WHERE user_id = _user_id AND currency = 'USDT' FOR UPDATE;
  IF _bal IS NULL OR _bal < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM markets WHERE id = _market_id AND creator_wallet = _user_id::text AND status IN ('active', 'ended')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your market or invalid status');
  END IF;

  UPDATE balances SET amount = amount - _amount, updated_at = now() WHERE user_id = _user_id AND currency = 'USDT';
  UPDATE markets SET initial_liquidity = initial_liquidity + _amount, liquidity = liquidity + _amount, updated_at = now() WHERE id = _market_id;
  INSERT INTO transactions (user_id, type, amount, market_id, status, side) VALUES (_user_id, 'buy', _amount, _market_id, 'confirmed', 'initial_liquidity');

  RETURN jsonb_build_object('success', true);
END;
$$;
