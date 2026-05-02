
CREATE OR REPLACE FUNCTION public.hold_creation_fee_escrow(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cur_amount numeric;
  _escrow_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM creation_fee_escrows WHERE user_id = _user_id AND status = 'held') THEN
    SELECT id INTO _escrow_id FROM creation_fee_escrows WHERE user_id = _user_id AND status = 'held' LIMIT 1;
    RETURN jsonb_build_object('success', true, 'escrow_id', _escrow_id, 'already_held', true);
  END IF;

  SELECT amount INTO _cur_amount
  FROM balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_amount < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE balances
  SET amount = amount - _amount, updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  INSERT INTO creation_fee_escrows (user_id, amount, status)
  VALUES (_user_id, _amount, 'held')
  RETURNING id INTO _escrow_id;

  -- Note: no transaction row written here. Final ledger entry is created when
  -- the escrow is released (either as 'used' → market_creation_fee, or
  -- 'refunded' → creation_fee_escrow_refund).

  RETURN jsonb_build_object('success', true, 'escrow_id', _escrow_id);
END;
$function$;
