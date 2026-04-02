
-- Fix topup_gift_balance to enforce auth.uid()
CREATE OR REPLACE FUNCTION public.topup_gift_balance(_user_id uuid, _amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cur_amount numeric;
  _caller_id uuid;
BEGIN
  _caller_id := auth.uid();
  
  -- Allow service role (caller is null) or own user only
  IF _caller_id IS NOT NULL AND _caller_id != _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT amount INTO _cur_amount
  FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_amount < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient main balance');
  END IF;

  UPDATE public.balances
  SET amount = amount - _amount, gift_balance = gift_balance + _amount, updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Fix withdraw_rewards_balance to enforce auth.uid()
CREATE OR REPLACE FUNCTION public.withdraw_rewards_balance(_user_id uuid, _amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cur_rewards numeric;
  _caller_id uuid;
BEGIN
  _caller_id := auth.uid();
  
  -- Allow service role (caller is null) or own user only
  IF _caller_id IS NOT NULL AND _caller_id != _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT rewards_balance INTO _cur_rewards
  FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND OR _cur_rewards < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient rewards balance');
  END IF;

  UPDATE public.balances
  SET rewards_balance = rewards_balance - _amount, amount = amount + _amount, updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  RETURN jsonb_build_object('success', true);
END;
$function$;
