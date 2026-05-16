CREATE OR REPLACE FUNCTION public.adjust_balance(_user_id uuid, _delta numeric, _bonus_delta numeric DEFAULT 0, _insurance_delta numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid;
  _cur_amount numeric;
  _cur_bonus numeric;
  _cur_insurance numeric;
  _new_amount numeric;
  _new_bonus numeric;
  _new_insurance numeric;
BEGIN
  _caller := auth.uid();
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can adjust balances';
  END IF;

  SELECT amount, bonus_balance, insurance_balance
    INTO _cur_amount, _cur_bonus, _cur_insurance
  FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- New row: any negative delta is by definition insufficient.
    IF _delta < 0 OR _bonus_delta < 0 OR _insurance_delta < 0 THEN
      RAISE EXCEPTION 'Insufficient funds: no balance record for user %', _user_id
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.balances (user_id, amount, bonus_balance, insurance_balance, currency)
    VALUES (_user_id, _delta, _bonus_delta, _insurance_delta, 'USDT');
    RETURN;
  END IF;

  _new_amount    := _cur_amount    + _delta;
  _new_bonus     := _cur_bonus     + _bonus_delta;
  _new_insurance := _cur_insurance + _insurance_delta;

  IF _delta < 0 AND _new_amount < 0 THEN
    RAISE EXCEPTION 'Insufficient main balance: have %, need %', _cur_amount, -_delta
      USING ERRCODE = 'check_violation';
  END IF;
  IF _bonus_delta < 0 AND _new_bonus < 0 THEN
    RAISE EXCEPTION 'Insufficient bonus balance: have %, need %', _cur_bonus, -_bonus_delta
      USING ERRCODE = 'check_violation';
  END IF;
  IF _insurance_delta < 0 AND _new_insurance < 0 THEN
    RAISE EXCEPTION 'Insufficient insurance balance: have %, need %', _cur_insurance, -_insurance_delta
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.balances
  SET amount = _new_amount,
      bonus_balance = _new_bonus,
      insurance_balance = _new_insurance,
      updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';
END;
$function$;