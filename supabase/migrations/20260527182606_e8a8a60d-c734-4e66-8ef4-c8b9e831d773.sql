
-- Add bonus/main split tracking to creation_fee_escrows
ALTER TABLE public.creation_fee_escrows
  ADD COLUMN IF NOT EXISTS bonus_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS main_amount numeric NOT NULL DEFAULT 0;

-- Backfill existing rows: assume legacy holds came from main balance
UPDATE public.creation_fee_escrows
SET main_amount = amount, bonus_amount = 0
WHERE main_amount = 0 AND bonus_amount = 0;

-- hold_creation_fee_escrow: take bonus first, then main
CREATE OR REPLACE FUNCTION public.hold_creation_fee_escrow(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bal record;
  _escrow_id uuid;
  _bonus_use numeric := 0;
  _main_use numeric := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM creation_fee_escrows WHERE user_id = _user_id AND status = 'held') THEN
    SELECT id INTO _escrow_id FROM creation_fee_escrows WHERE user_id = _user_id AND status = 'held' LIMIT 1;
    RETURN jsonb_build_object('success', true, 'escrow_id', _escrow_id, 'already_held', true);
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT amount, COALESCE(bonus_balance, 0) AS bonus_balance
  INTO _bal
  FROM balances
  WHERE user_id = _user_id AND currency = 'USDT'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance record not found');
  END IF;

  _bonus_use := LEAST(_bal.bonus_balance, _amount);
  _main_use := _amount - _bonus_use;

  IF _bal.amount < _main_use THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE balances
  SET amount = amount - _main_use,
      bonus_balance = bonus_balance - _bonus_use,
      updated_at = now()
  WHERE user_id = _user_id AND currency = 'USDT';

  INSERT INTO creation_fee_escrows (user_id, amount, bonus_amount, main_amount, status)
  VALUES (_user_id, _amount, _bonus_use, _main_use, 'held')
  RETURNING id INTO _escrow_id;

  INSERT INTO public.transactions (user_id, type, amount, status, side, description)
  VALUES (_user_id, 'buy', _amount, 'confirmed', 'creation_fee_escrow_hold',
          'Market creation fee held in escrow (bonus: ' || _bonus_use::text || ', main: ' || _main_use::text || ')');

  RETURN jsonb_build_object('success', true, 'escrow_id', _escrow_id, 'bonus_used', _bonus_use, 'main_used', _main_use);
END;
$function$;

-- release_creation_fee_escrow: refund back to the original buckets
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
    SET amount = amount + COALESCE(_escrow.main_amount, _escrow.amount),
        bonus_balance = bonus_balance + COALESCE(_escrow.bonus_amount, 0),
        updated_at = now()
    WHERE user_id = _escrow.user_id AND currency = 'USDT';

    INSERT INTO public.transactions (user_id, type, amount, status, side, description)
    VALUES (_escrow.user_id, 'refund', _escrow.amount, 'confirmed', 'creation_fee_escrow_refund',
            'Market creation fee escrow refunded (bonus: ' || COALESCE(_escrow.bonus_amount, 0)::text || ', main: ' || COALESCE(_escrow.main_amount, _escrow.amount)::text || ')');
  ELSIF _action = 'used' THEN
    UPDATE platform_pool
    SET balance = balance + _escrow.amount, updated_at = now()
    WHERE id = (SELECT id FROM platform_pool LIMIT 1);

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

-- finalize_market_creation_atomic: bonus only covers the market creation fee, not boost/broadcast/auto-resolve
CREATE OR REPLACE FUNCTION public.finalize_market_creation_atomic(
  _market_data jsonb,
  _options text[] DEFAULT ARRAY[]::text[],
  _draft_id uuid DEFAULT NULL::uuid,
  _liquidity_amount numeric DEFAULT 0,
  _fee_amount numeric DEFAULT 0,
  _market_creation_fee_amount numeric DEFAULT 0,
  _auto_resolve_fee_amount numeric DEFAULT 0,
  _boost_amount numeric DEFAULT 0,
  _boost_tier text DEFAULT NULL::text,
  _boost_hours integer DEFAULT 0,
  _broadcast_amount numeric DEFAULT 0,
  _escrow_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _market_id uuid;
  _market_type text := COALESCE(NULLIF(_market_data->>'market_type', ''), 'binary');
  _creator_wallet text := _market_data->>'creator_wallet';
  _status text := COALESCE(NULLIF(_market_data->>'status', ''), 'active');
  _title text := COALESCE(NULLIF(trim(_market_data->>'title'), ''), 'Untitled Market');
  _description text := COALESCE(NULLIF(trim(_market_data->>'description'), ''), 'Market description pending.');
  _category text := COALESCE(NULLIF(_market_data->>'category', ''), 'Other');
  _end_date date;
  _resolution_source text := COALESCE(NULLIF(trim(_market_data->>'resolution_source'), ''), 'TBD');
  _initial_liquidity numeric := COALESCE(NULLIF(_market_data->>'initial_liquidity', '')::numeric, 0);
  _liquidity numeric := COALESCE(NULLIF(_market_data->>'liquidity', '')::numeric, _initial_liquidity);
  _auto_resolve_deadline timestamptz := NULLIF(_market_data->>'auto_resolve_deadline', '')::timestamptz;
  _sport_match_id text := NULLIF(_market_data->>'sport_match_id', '');
  _balance record;
  _bonus_for_fee numeric := 0;
  _main_deduction numeric := 0;
  _expected_fee numeric := 0;
  _escrow record;
  _opt text;
  _clean_options text[] := ARRAY[]::text[];
  _equal_price numeric;
  _saved_options jsonb := '[]'::jsonb;
  _i integer := 0;
  _broadcast_id uuid := NULL;
BEGIN
  IF _caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  IF _creator_wallet IS NULL OR _creator_wallet <> _caller::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized creator');
  END IF;

  IF _liquidity_amount < 0 OR _fee_amount < 0 OR _market_creation_fee_amount < 0 OR _auto_resolve_fee_amount < 0 OR _boost_amount < 0 OR _broadcast_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid charge amount');
  END IF;

  _expected_fee := _market_creation_fee_amount + _auto_resolve_fee_amount + _boost_amount + _broadcast_amount;
  IF abs(_fee_amount - _expected_fee) > 0.000001 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creation fee mismatch. Please refresh and try again.');
  END IF;

  IF NULLIF(_market_data->>'image_url', '') IS NULL AND _status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A cover image is required');
  END IF;

  _end_date := COALESCE(NULLIF(_market_data->>'end_date', '')::date, CURRENT_DATE);

  IF _sport_match_id IS NOT NULL AND _auto_resolve_deadline IS NOT NULL AND _end_date <= _auto_resolve_deadline::date THEN
    _end_date := (_auto_resolve_deadline::date + 1);
  END IF;

  IF NULLIF(_market_data->>'twitter_resource_id', '') IS NOT NULL AND _end_date > (CURRENT_DATE + interval '5 days')::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'Twitter/X markets must resolve within 5 days');
  END IF;

  IF _market_type <> 'binary' THEN
    FOREACH _opt IN ARRAY COALESCE(_options, ARRAY[]::text[]) LOOP
      _opt := trim(COALESCE(_opt, ''));
      IF _opt <> '' AND NOT (_opt = ANY(_clean_options)) THEN
        _clean_options := array_append(_clean_options, _opt);
      END IF;
    END LOOP;

    IF array_length(_clean_options, 1) IS NULL OR array_length(_clean_options, 1) < 2 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Add at least two valid options');
    END IF;
  END IF;

  IF _escrow_id IS NOT NULL THEN
    SELECT * INTO _escrow
    FROM public.creation_fee_escrows
    WHERE id = _escrow_id AND user_id = _caller AND status = 'held'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Creation fee escrow not found. Please refresh and try again.');
    END IF;
  END IF;

  SELECT amount, bonus_balance INTO _balance
  FROM public.balances
  WHERE user_id = _caller
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance record not found');
  END IF;

  -- Bonus can ONLY cover the market creation fee (not boost/broadcast/auto_resolve, not liquidity).
  -- If the creation fee is already in escrow, _market_creation_fee_amount will be 0 from the caller.
  _bonus_for_fee := LEAST(COALESCE(_balance.bonus_balance, 0), _market_creation_fee_amount);
  _main_deduction := _liquidity_amount
                     + (_market_creation_fee_amount - _bonus_for_fee)
                     + _auto_resolve_fee_amount
                     + _boost_amount
                     + _broadcast_amount;

  IF COALESCE(_balance.amount, 0) < _main_deduction THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance for market creation', 'available', _balance.amount, 'needed', _main_deduction);
  END IF;

  UPDATE public.balances
  SET amount = amount - _main_deduction,
      bonus_balance = bonus_balance - _bonus_for_fee,
      updated_at = now()
  WHERE user_id = _caller;

  IF _draft_id IS NOT NULL THEN
    SELECT id INTO _market_id
    FROM public.markets
    WHERE id = _draft_id AND creator_wallet = _caller::text AND status = 'draft'
    FOR UPDATE;

    IF _market_id IS NULL THEN
      RAISE EXCEPTION 'Draft not found';
    END IF;

    UPDATE public.markets SET
      title = _title,
      description = _description,
      details = NULLIF(_market_data->>'details', ''),
      video_url = NULLIF(_market_data->>'video_url', ''),
      image_url = COALESCE(NULLIF(_market_data->>'image_url', ''), image_url),
      category = _category,
      end_date = _end_date,
      resolution_source = _resolution_source,
      initial_liquidity = _initial_liquidity,
      liquidity = _liquidity,
      tx_hash = NULLIF(_market_data->>'tx_hash', ''),
      contract_address = NULLIF(_market_data->>'contract_address', ''),
      market_type = _market_type,
      status = _status,
      auto_resolve = COALESCE(NULLIF(_market_data->>'auto_resolve', '')::boolean, false),
      auto_resolve_asset = NULLIF(_market_data->>'auto_resolve_asset', ''),
      auto_resolve_target_price = NULLIF(_market_data->>'auto_resolve_target_price', '')::numeric,
      auto_resolve_operator = NULLIF(_market_data->>'auto_resolve_operator', ''),
      auto_resolve_deadline = _auto_resolve_deadline,
      sport_type = NULLIF(_market_data->>'sport_type', ''),
      sport_match_id = _sport_match_id,
      sport_predicted_outcome = NULLIF(_market_data->>'sport_predicted_outcome', ''),
      sport_league = NULLIF(_market_data->>'sport_league', ''),
      twitter_resource_id = NULLIF(_market_data->>'twitter_resource_id', ''),
      twitter_metric_type = NULLIF(_market_data->>'twitter_metric_type', ''),
      creator_name = COALESCE(NULLIF(_market_data->>'creator_name', ''), creator_name),
      updated_at = now()
    WHERE id = _market_id;
  ELSE
    INSERT INTO public.markets (
      creator_wallet, creator_name, title, description, details, video_url, image_url,
      category, end_date, resolution_source, initial_liquidity, liquidity,
      tx_hash, contract_address, market_type, status, auto_resolve,
      auto_resolve_asset, auto_resolve_target_price, auto_resolve_operator,
      auto_resolve_deadline, sport_type, sport_match_id, sport_predicted_outcome,
      sport_league, twitter_resource_id, twitter_metric_type
    ) VALUES (
      _creator_wallet,
      COALESCE(NULLIF(_market_data->>'creator_name', ''), 'Anonymous'),
      _title,
      _description,
      NULLIF(_market_data->>'details', ''),
      NULLIF(_market_data->>'video_url', ''),
      NULLIF(_market_data->>'image_url', ''),
      _category,
      _end_date,
      _resolution_source,
      _initial_liquidity,
      _liquidity,
      NULLIF(_market_data->>'tx_hash', ''),
      NULLIF(_market_data->>'contract_address', ''),
      _market_type,
      _status,
      COALESCE(NULLIF(_market_data->>'auto_resolve', '')::boolean, false),
      NULLIF(_market_data->>'auto_resolve_asset', ''),
      NULLIF(_market_data->>'auto_resolve_target_price', '')::numeric,
      NULLIF(_market_data->>'auto_resolve_operator', ''),
      _auto_resolve_deadline,
      NULLIF(_market_data->>'sport_type', ''),
      _sport_match_id,
      NULLIF(_market_data->>'sport_predicted_outcome', ''),
      NULLIF(_market_data->>'sport_league', ''),
      NULLIF(_market_data->>'twitter_resource_id', ''),
      NULLIF(_market_data->>'twitter_metric_type', '')
    ) RETURNING id INTO _market_id;
  END IF;

  IF _liquidity_amount > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side)
    VALUES (_caller, 'buy', _liquidity_amount, _market_id, 'confirmed', 'initial_liquidity');
  END IF;

  IF _market_creation_fee_amount > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side)
    VALUES (_caller, 'buy', _market_creation_fee_amount, _market_id, 'confirmed', 'market_creation_fee');

    UPDATE public.platform_pool
    SET balance = balance + _market_creation_fee_amount, updated_at = now()
    WHERE id = (SELECT id FROM public.platform_pool LIMIT 1);
  END IF;

  IF _auto_resolve_fee_amount > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side)
    VALUES (_caller, 'buy', _auto_resolve_fee_amount, _market_id, 'confirmed', 'auto_resolve_fee');
  END IF;

  IF _boost_amount > 0 THEN
    INSERT INTO public.market_boosts (market_id, tier, amount, payer_wallet, ends_at, status)
    VALUES (_market_id, COALESCE(_boost_tier, 'flash'), _boost_amount, _caller::text, now() + make_interval(hours => GREATEST(_boost_hours, 1)), 'active');

    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side)
    VALUES (_caller, 'buy', _boost_amount, _market_id, 'confirmed', 'boost_fee');
  END IF;

  IF _broadcast_amount > 0 THEN
    INSERT INTO public.market_broadcasts (market_id, user_id, tier, amount, status)
    VALUES (_market_id, _caller, 'alert', _broadcast_amount, 'pending')
    RETURNING id INTO _broadcast_id;

    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side)
    VALUES (_caller, 'buy', _broadcast_amount, _market_id, 'confirmed', 'broadcast_fee');
  END IF;

  IF _escrow_id IS NOT NULL THEN
    UPDATE public.platform_pool
    SET balance = balance + _escrow.amount, updated_at = now()
    WHERE id = (SELECT id FROM public.platform_pool LIMIT 1);

    INSERT INTO public.transactions (user_id, type, amount, market_id, status, side, description)
    VALUES (_caller, 'buy', _escrow.amount, _market_id, 'confirmed', 'market_creation_fee',
            'Market creation fee applied (escrow released; bonus: ' || COALESCE(_escrow.bonus_amount, 0)::text || ', main: ' || COALESCE(_escrow.main_amount, _escrow.amount)::text || ')');

    UPDATE public.creation_fee_escrows
    SET status = 'used', released_at = now()
    WHERE id = _escrow_id;
  END IF;

  IF _market_type <> 'binary' THEN
    DELETE FROM public.market_options WHERE market_id = _market_id;
    _equal_price := round((1 / array_length(_clean_options, 1)::numeric) * 100) / 100;

    FOREACH _opt IN ARRAY _clean_options LOOP
      INSERT INTO public.market_options (market_id, label, price, sort_order)
      VALUES (_market_id, _opt, _equal_price, _i);
      _i := _i + 1;
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'label', label, 'sort_order', sort_order) ORDER BY sort_order), '[]'::jsonb)
  INTO _saved_options
  FROM public.market_options
  WHERE market_id = _market_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', _market_id,
    'options', _saved_options,
    'broadcast_id', _broadcast_id,
    'deducted_main', _main_deduction,
    'deducted_bonus', _bonus_for_fee
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_market_creation_atomic(jsonb, text[], uuid, numeric, numeric, numeric, numeric, numeric, text, integer, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_market_creation_atomic(jsonb, text[], uuid, numeric, numeric, numeric, numeric, numeric, text, integer, numeric, uuid) TO authenticated;
