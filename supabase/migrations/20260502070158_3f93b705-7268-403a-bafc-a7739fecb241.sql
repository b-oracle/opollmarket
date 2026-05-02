
-- Harden market creation ledger: write transactions atomically inside RPCs
-- so a client crash between deduction and txn-row insert can never lose a ledger entry.

-- 1) deduct_market_liquidity: now optionally accepts _market_id and writes transaction rows.
CREATE OR REPLACE FUNCTION public.deduct_market_liquidity(
  _user_id uuid,
  _liquidity_amount numeric,
  _fee_amount numeric DEFAULT 0,
  _bonus_for_fee numeric DEFAULT 0,
  _market_id uuid DEFAULT NULL,
  _log_transactions boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _balance record;
  _main_deduction numeric;
  _actual_deduction numeric;
  _debt_amount numeric;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NOT NULL AND _caller != _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

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

    _debt_amount := 0;
    _actual_deduction := _main_deduction;
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
  END IF;

  -- Atomically log transactions when requested
  IF _log_transactions AND _liquidity_amount > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side)
    VALUES (_user_id, 'buy', _liquidity_amount, _market_id, 'confirmed', 'initial_liquidity');
  END IF;

  IF _log_transactions AND _fee_amount > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side)
    VALUES (_user_id, 'buy', _fee_amount, _market_id, 'confirmed', 'market_creation_fee');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deducted_main', _actual_deduction,
    'deducted_bonus', _bonus_for_fee,
    'debt', _debt_amount
  );
END;
$function$;

-- 2) hold_creation_fee_escrow: log a "fee held" transaction row at hold time
--    so the deduction is visible in audits even before the market is created.
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

  -- Atomically log the escrow hold so the deduction is auditable
  INSERT INTO public.transactions (user_id, type, amount, status, side, description)
  VALUES (_user_id, 'buy', _amount, 'confirmed', 'creation_fee_escrow_hold',
          'Market creation fee held in escrow');

  RETURN jsonb_build_object('success', true, 'escrow_id', _escrow_id);
END;
$function$;

-- 3) release_creation_fee_escrow: log refund or final-fee transaction rows atomically
CREATE OR REPLACE FUNCTION public.release_creation_fee_escrow(_escrow_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    -- Log refund of the escrow hold
    INSERT INTO public.transactions (user_id, type, amount, status, side, description)
    VALUES (_escrow.user_id, 'refund', _escrow.amount, 'confirmed', 'creation_fee_escrow_refund',
            'Market creation fee escrow refunded');
  ELSIF _action = 'used' THEN
    UPDATE platform_pool
    SET balance = balance + _escrow.amount, updated_at = now()
    WHERE id = (SELECT id FROM platform_pool LIMIT 1);

    -- Log the final fee being applied
    INSERT INTO public.transactions (user_id, type, amount, status, side, description)
    VALUES (_escrow.user_id, 'buy', _escrow.amount, 'confirmed', 'market_creation_fee',
            'Market creation fee applied (escrow released)');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  UPDATE creation_fee_escrows
  SET status = _action, released_at = now()
  WHERE id = _escrow_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;
