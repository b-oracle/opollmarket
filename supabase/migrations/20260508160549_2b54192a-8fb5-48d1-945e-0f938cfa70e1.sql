CREATE OR REPLACE FUNCTION public.create_market_atomic(_market_data jsonb, _options text[] DEFAULT ARRAY[]::text[], _draft_id uuid DEFAULT NULL::uuid)
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
  _opt text;
  _clean_options text[] := ARRAY[]::text[];
  _equal_price numeric;
  _saved_options jsonb := '[]'::jsonb;
  _i integer := 0;
BEGIN
  IF _caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sign in required');
  END IF;

  IF _creator_wallet IS NULL OR _creator_wallet <> _caller::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized creator');
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

  IF _draft_id IS NOT NULL THEN
    SELECT id INTO _market_id
    FROM public.markets
    WHERE id = _draft_id AND creator_wallet = _caller::text AND status = 'draft'
    FOR UPDATE;

    IF _market_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Draft not found');
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

  RETURN jsonb_build_object('success', true, 'id', _market_id, 'options', _saved_options);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;