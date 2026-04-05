CREATE OR REPLACE FUNCTION public.buy_update_market_prices(
  _market_id uuid,
  _side text,
  _pool_amount numeric,
  _bet_amount numeric,
  _is_multi boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _market record;
  _new_yes numeric;
  _new_no numeric;
  _new_volume numeric;
  _new_liquidity numeric;
  _total_liq numeric;
  _impact numeric;
  _distinct_participants integer;
BEGIN
  -- Lock the market row to prevent concurrent price updates
  SELECT volume, liquidity, yes_price, no_price, participants
  INTO _market
  FROM public.markets
  WHERE id = _market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market not found');
  END IF;

  _new_volume := _market.volume + _bet_amount;
  _new_liquidity := _market.liquidity + _pool_amount;

  -- Count distinct participants
  SELECT COUNT(DISTINCT user_id) INTO _distinct_participants
  FROM public.positions
  WHERE market_id = _market_id AND shares > 0;

  IF NOT _is_multi THEN
    _total_liq := _market.volume + _pool_amount + 100;
    _impact := LEAST(_pool_amount / _total_liq, 0.15);
    _new_yes := _market.yes_price;

    IF _side = 'yes' THEN
      _new_yes := LEAST(0.99, _new_yes + _impact);
    ELSE
      _new_yes := GREATEST(0.01, _new_yes - _impact);
    END IF;

    _new_no := ROUND((1 - _new_yes) * 100) / 100;
    _new_yes := ROUND(_new_yes * 100) / 100;

    UPDATE public.markets
    SET volume = _new_volume,
        liquidity = _new_liquidity,
        yes_price = _new_yes,
        no_price = _new_no,
        participants = COALESCE(_distinct_participants, _market.participants + 1)
    WHERE id = _market_id;

    RETURN jsonb_build_object('success', true, 'yes_price', _new_yes, 'no_price', _new_no);
  ELSE
    UPDATE public.markets
    SET volume = _new_volume,
        liquidity = _new_liquidity,
        participants = COALESCE(_distinct_participants, _market.participants + 1)
    WHERE id = _market_id;

    RETURN jsonb_build_object('success', true);
  END IF;
END;
$$;