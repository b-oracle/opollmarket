
CREATE OR REPLACE FUNCTION public.deduct_market_liquidity(
  _user_id uuid,
  _liquidity_amount numeric,
  _fee_amount numeric DEFAULT 0,
  _bonus_for_fee numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _balance record;
  _main_deduction numeric;
BEGIN
  _main_deduction := _liquidity_amount + (_fee_amount - _bonus_for_fee);

  -- Lock the row to prevent race conditions
  SELECT amount, bonus_balance INTO _balance
  FROM public.balances
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance record not found');
  END IF;

  IF _balance.amount < _main_deduction THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'available', _balance.amount, 'needed', _main_deduction);
  END IF;

  IF _bonus_for_fee > 0 AND _balance.bonus_balance < _bonus_for_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bonus balance');
  END IF;

  UPDATE public.balances
  SET amount = amount - _main_deduction,
      bonus_balance = bonus_balance - _bonus_for_fee,
      updated_at = now()
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('success', true, 'deducted_main', _main_deduction, 'deducted_bonus', _bonus_for_fee);
END;
$$;
