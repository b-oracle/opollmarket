
CREATE OR REPLACE FUNCTION public.transfer_rewards_to_gift(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rewards numeric;
  _gift numeric;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT rewards_balance, gift_balance INTO _rewards, _gift
    FROM balances
    WHERE user_id = _user_id AND currency = 'USDT'
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance not found');
  END IF;

  IF _rewards < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient rewards balance');
  END IF;

  UPDATE balances
    SET rewards_balance = rewards_balance - _amount,
        gift_balance = gift_balance + _amount,
        updated_at = now()
    WHERE user_id = _user_id AND currency = 'USDT';

  RETURN jsonb_build_object(
    'success', true,
    'remaining_rewards', _rewards - _amount,
    'new_gift_balance', _gift + _amount
  );
END;
$$;
