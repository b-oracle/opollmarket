CREATE OR REPLACE FUNCTION public.publish_draft_market(_market_id uuid, _market_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid;
  _market record;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT id, creator_wallet, status INTO _market
  FROM markets
  WHERE id = _market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market not found');
  END IF;

  IF _market.creator_wallet != _caller::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your market');
  END IF;

  IF _market.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Market is not a draft');
  END IF;

  UPDATE markets SET
    title = COALESCE(NULLIF(_market_data->>'title', ''), title),
    description = COALESCE(NULLIF(_market_data->>'description', ''), description),
    details = NULLIF(_market_data->>'details', ''),
    video_url = NULLIF(_market_data->>'video_url', ''),
    image_url = COALESCE(NULLIF(_market_data->>'image_url', ''), image_url),
    category = COALESCE(NULLIF(_market_data->>'category', ''), category),
    end_date = COALESCE(NULLIF(_market_data->>'end_date', '')::date, end_date),
    resolution_source = COALESCE(NULLIF(_market_data->>'resolution_source', ''), resolution_source),
    initial_liquidity = COALESCE(NULLIF(_market_data->>'initial_liquidity', '')::numeric, initial_liquidity),
    liquidity = COALESCE(NULLIF(_market_data->>'liquidity', '')::numeric, liquidity),
    tx_hash = NULLIF(_market_data->>'tx_hash', ''),
    contract_address = NULLIF(_market_data->>'contract_address', ''),
    market_type = COALESCE(NULLIF(_market_data->>'market_type', ''), market_type),
    status = COALESCE(NULLIF(_market_data->>'status', ''), 'active'),
    auto_resolve = COALESCE(NULLIF(_market_data->>'auto_resolve', '')::boolean, auto_resolve),
    auto_resolve_asset = NULLIF(_market_data->>'auto_resolve_asset', ''),
    auto_resolve_target_price = NULLIF(_market_data->>'auto_resolve_target_price', '')::numeric,
    auto_resolve_operator = NULLIF(_market_data->>'auto_resolve_operator', ''),
    auto_resolve_deadline = NULLIF(_market_data->>'auto_resolve_deadline', '')::timestamptz,
    sport_type = NULLIF(_market_data->>'sport_type', ''),
    sport_match_id = NULLIF(_market_data->>'sport_match_id', ''),
    sport_predicted_outcome = NULLIF(_market_data->>'sport_predicted_outcome', ''),
    sport_league = NULLIF(_market_data->>'sport_league', ''),
    twitter_resource_id = NULLIF(_market_data->>'twitter_resource_id', ''),
    twitter_metric_type = NULLIF(_market_data->>'twitter_metric_type', ''),
    creator_name = COALESCE(NULLIF(_market_data->>'creator_name', ''), creator_name),
    updated_at = now()
  WHERE id = _market_id;

  IF _market_data->>'market_type' IS NOT NULL AND _market_data->>'market_type' != 'binary' THEN
    DELETE FROM market_options WHERE market_id = _market_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', _market_id);
END;
$function$;