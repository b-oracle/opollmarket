
-- 1. Harden adjust_balance: only service role (auth.uid() IS NULL) or admin/super_admin
CREATE OR REPLACE FUNCTION public.adjust_balance(_user_id uuid, _delta numeric, _bonus_delta numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid;
BEGIN
  _caller := auth.uid();
  -- Only allow service role (NULL caller) or admin/super_admin
  IF _caller IS NOT NULL 
     AND NOT public.has_role(_caller, 'admin') 
     AND NOT public.has_role(_caller, 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can adjust balances';
  END IF;

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

-- 2. Harden adjust_platform_pool: only service role or admin/super_admin
CREATE OR REPLACE FUNCTION public.adjust_platform_pool(_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NOT NULL 
     AND NOT public.has_role(_caller, 'admin') 
     AND NOT public.has_role(_caller, 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admins can adjust platform pool';
  END IF;

  UPDATE public.platform_pool
  SET balance = balance + _delta, updated_at = now()
  WHERE id = (SELECT id FROM public.platform_pool LIMIT 1);
END;
$$;

-- 3. Harden increment_bc400_pool: only service role or admin/super_admin
CREATE OR REPLACE FUNCTION public.increment_bc400_pool(_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NOT NULL 
     AND NOT public.has_role(_caller, 'admin') 
     AND NOT public.has_role(_caller, 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.commission_settings
  SET bc400_pool_balance = bc400_pool_balance + _amount, updated_at = now()
  WHERE id = (SELECT id FROM public.commission_settings LIMIT 1);
END;
$$;

-- 4. Harden deduct_market_liquidity: only service role or own user (no negative liquidity exploit)
CREATE OR REPLACE FUNCTION public.deduct_market_liquidity(_user_id uuid, _liquidity_amount numeric, _fee_amount numeric DEFAULT 0, _bonus_for_fee numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _balance record;
  _main_deduction numeric;
  _actual_deduction numeric;
  _debt_amount numeric;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  -- Only service role or the user themselves
  IF _caller IS NOT NULL AND _caller != _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Prevent negative liquidity exploit
  IF _liquidity_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Liquidity amount cannot be negative');
  END IF;

  _main_deduction := _liquidity_amount + (_fee_amount - _bonus_for_fee);

  IF _main_deduction < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid deduction amount');
  END IF;

  SELECT amount, bonus_balance INTO _balance
  FROM public.balances
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance record not found');
  END IF;

  IF _bonus_for_fee > 0 AND _balance.bonus_balance < _bonus_for_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bonus balance');
  END IF;

  IF _balance.amount >= _main_deduction THEN
    UPDATE public.balances
    SET amount = amount - _main_deduction,
        bonus_balance = bonus_balance - _bonus_for_fee,
        updated_at = now()
    WHERE user_id = _user_id;

    RETURN jsonb_build_object('success', true, 'deducted_main', _main_deduction, 'deducted_bonus', _bonus_for_fee, 'debt', 0);
  ELSE
    _actual_deduction := _balance.amount;
    _debt_amount := _main_deduction - _actual_deduction;

    UPDATE public.balances
    SET amount = 0,
        bonus_balance = bonus_balance - _bonus_for_fee,
        updated_at = now()
    WHERE user_id = _user_id;

    INSERT INTO public.balance_debts (user_id, amount, reason)
    VALUES (_user_id, _debt_amount, 'market_liquidity');

    RETURN jsonb_build_object('success', true, 'deducted_main', _actual_deduction, 'deducted_bonus', _bonus_for_fee, 'debt', _debt_amount);
  END IF;
END;
$$;

-- 5. Harden release_creation_fee_escrow: only service role, admin, or escrow owner
CREATE OR REPLACE FUNCTION public.release_creation_fee_escrow(_escrow_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _escrow record;
  _caller uuid;
BEGIN
  _caller := auth.uid();

  SELECT * INTO _escrow
  FROM creation_fee_escrows
  WHERE id = _escrow_id AND status = 'held'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow not found or already released');
  END IF;

  -- Only service role, admin/super_admin, or the escrow owner can release
  IF _caller IS NOT NULL 
     AND _caller != _escrow.user_id
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _action = 'refunded' THEN
    UPDATE balances
    SET amount = amount + _escrow.amount, updated_at = now()
    WHERE user_id = _escrow.user_id AND currency = 'USDT';
  ELSIF _action = 'used' THEN
    UPDATE platform_pool
    SET balance = balance + _escrow.amount, updated_at = now()
    WHERE id = (SELECT id FROM platform_pool LIMIT 1);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  UPDATE creation_fee_escrows
  SET status = _action, released_at = now()
  WHERE id = _escrow_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Harden debit_balance_atomic: only service role or own user
CREATE OR REPLACE FUNCTION public.debit_balance_atomic(_user_id uuid, _main_deduct numeric, _bonus_deduct numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cur_amount numeric;
  _cur_bonus numeric;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NOT NULL AND _caller != _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _main_deduct < 0 OR _bonus_deduct < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deduction amounts must be non-negative');
  END IF;

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

-- 7. Harden buy_update_market_prices: only service role or admin
CREATE OR REPLACE FUNCTION public.buy_update_market_prices(_market_id uuid, _side text, _pool_amount numeric, _bet_amount numeric, _is_multi boolean)
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
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NOT NULL 
     AND NOT public.has_role(_caller, 'admin') 
     AND NOT public.has_role(_caller, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: server-only function');
  END IF;

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

-- 8. Harden sell_update_market_prices: only service role or admin
CREATE OR REPLACE FUNCTION public.sell_update_market_prices(_market_id uuid, _side text, _gross_proceeds numeric, _net_proceeds numeric, _is_multi boolean)
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
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NOT NULL 
     AND NOT public.has_role(_caller, 'admin') 
     AND NOT public.has_role(_caller, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: server-only function');
  END IF;

  SELECT volume, liquidity, yes_price, no_price
  INTO _market
  FROM public.markets
  WHERE id = _market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market not found');
  END IF;

  _new_volume := _market.volume + _gross_proceeds;
  _new_liquidity := GREATEST(0, _market.liquidity - _net_proceeds);

  IF NOT _is_multi THEN
    _total_liq := _market.volume + _market.liquidity + 100;
    _impact := LEAST(_gross_proceeds / _total_liq, 0.15);
    _new_yes := _market.yes_price;

    IF _side = 'yes' THEN
      _new_yes := GREATEST(0.01, _new_yes - _impact);
    ELSE
      _new_yes := LEAST(0.99, _new_yes + _impact);
    END IF;

    _new_no := ROUND((1 - _new_yes) * 100) / 100;
    _new_yes := ROUND(_new_yes * 100) / 100;

    UPDATE public.markets
    SET volume = _new_volume,
        liquidity = _new_liquidity,
        yes_price = _new_yes,
        no_price = _new_no
    WHERE id = _market_id;

    RETURN jsonb_build_object('success', true, 'yes_price', _new_yes, 'no_price', _new_no);
  ELSE
    UPDATE public.markets
    SET volume = _new_volume,
        liquidity = _new_liquidity
    WHERE id = _market_id;

    RETURN jsonb_build_object('success', true);
  END IF;
END;
$$;
