
CREATE OR REPLACE FUNCTION public.get_user_trade_count(_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT COUNT(*) FROM public.transactions WHERE user_id = _user_id AND type = 'buy' AND status = 'confirmed'), 0)
    +
    COALESCE((SELECT COUNT(*) FROM public.quick_bets WHERE user_id = _user_id), 0);
$$;
