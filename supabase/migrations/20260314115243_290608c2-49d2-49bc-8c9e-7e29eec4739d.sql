
-- Atomic balance credit/debit function (prevents race conditions)
CREATE OR REPLACE FUNCTION public.adjust_balance(
  _user_id uuid,
  _delta numeric,
  _bonus_delta numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.balances
  SET amount = GREATEST(0, amount + _delta),
      bonus_balance = GREATEST(0, bonus_balance + _bonus_delta),
      updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  IF NOT FOUND THEN
    INSERT INTO public.balances (user_id, amount, bonus_balance, currency)
    VALUES (_user_id, GREATEST(0, _delta), GREATEST(0, _bonus_delta), 'USDT');
  END IF;
END;
$$;

-- Atomic debit with row-level lock and balance check
CREATE OR REPLACE FUNCTION public.debit_balance_atomic(
  _user_id uuid,
  _main_deduct numeric,
  _bonus_deduct numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cur_amount numeric;
  _cur_bonus numeric;
BEGIN
  SELECT amount, bonus_balance INTO _cur_amount, _cur_bonus
  FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No balance record');
  END IF;

  IF _cur_amount < _main_deduct THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient main balance', 'available', _cur_amount);
  END IF;

  IF _cur_bonus < _bonus_deduct THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bonus balance');
  END IF;

  UPDATE public.balances
  SET amount = amount - _main_deduct,
      bonus_balance = bonus_balance - _bonus_deduct,
      updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  RETURN jsonb_build_object('success', true, 'prev_amount', _cur_amount, 'prev_bonus', _cur_bonus);
END;
$$;
