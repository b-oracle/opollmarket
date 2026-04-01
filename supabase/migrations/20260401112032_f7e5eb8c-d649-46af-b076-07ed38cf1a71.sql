
-- Fix adjust_balance (3-param version with insurance) to use FOR UPDATE
CREATE OR REPLACE FUNCTION public.adjust_balance(_user_id uuid, _delta numeric, _bonus_delta numeric DEFAULT 0, _insurance_delta numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _found boolean;
BEGIN
  -- Lock the row first to prevent concurrent interleaving
  PERFORM 1 FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  UPDATE public.balances
  SET amount = GREATEST(0, amount + _delta),
      bonus_balance = GREATEST(0, bonus_balance + _bonus_delta),
      insurance_balance = GREATEST(0, insurance_balance + _insurance_delta),
      updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  IF NOT FOUND THEN
    INSERT INTO public.balances (user_id, amount, bonus_balance, insurance_balance, currency)
    VALUES (_user_id, GREATEST(0, _delta), GREATEST(0, _bonus_delta), GREATEST(0, _insurance_delta), 'USDT');
  END IF;
END;
$$;

-- Fix adjust_balance (2-param version) to use FOR UPDATE
CREATE OR REPLACE FUNCTION public.adjust_balance(_user_id uuid, _delta numeric, _bonus_delta numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Lock the row first to prevent concurrent interleaving
  PERFORM 1 FROM public.balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

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
