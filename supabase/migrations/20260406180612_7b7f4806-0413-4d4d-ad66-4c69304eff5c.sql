
CREATE OR REPLACE FUNCTION public.publish_draft_market(
  _market_id uuid,
  _market_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid;
  _market record;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Lock and verify ownership + draft status
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

  -- Update all fields from the provided data
  UPDATE markets SET
    title = COALESCE(_market_data->>'title', title),
    description = COALESCE(_market_data->>'description', description),
    details = _market_data->>'details',
    video_url = _market_data->>'video_url',
    image_url = COALESCE(_market_data->>'image_url', image_url),
    category = COALESCE(_market_data->>'category', category),
    end_date = COALESCE(_market_data->>'end_date', end_date),
    resolution_source = COALESCE(_market_data->>'resolution_source', resolution_source),
    initial_liquidity = COALESCE((_market_data->>'initial_liquidity')::numeric, initial_liquidity),
    liquidity = COALESCE((_market_data->>'liquidity')::numeric, liquidity),
    tx_hash = _market_data->>'tx_hash',
    contract_address = _market_data->>'contract_address',
    market_type = COALESCE(_market_data->>'market_type', market_type),
    status = COALESCE(_market_data->>'status', 'active'),
    auto_resolve = COALESCE((_market_data->>'auto_resolve')::boolean, auto_resolve),
    auto_resolve_asset = _market_data->>'auto_resolve_asset',
    auto_resolve_target_price = (_market_data->>'auto_resolve_target_price')::numeric,
    auto_resolve_operator = _market_data->>'auto_resolve_operator',
    auto_resolve_deadline = (_market_data->>'auto_resolve_deadline')::timestamptz,
    sport_type = _market_data->>'sport_type',
    sport_match_id = _market_data->>'sport_match_id',
    sport_predicted_outcome = _market_data->>'sport_predicted_outcome',
    sport_league = _market_data->>'sport_league',
    twitter_resource_id = _market_data->>'twitter_resource_id',
    twitter_metric_type = _market_data->>'twitter_metric_type',
    creator_name = COALESCE(_market_data->>'creator_name', creator_name),
    updated_at = now()
  WHERE id = _market_id;

  -- Clear existing options for re-insertion
  IF _market_data->>'market_type' IS NOT NULL AND _market_data->>'market_type' != 'binary' THEN
    DELETE FROM market_options WHERE market_id = _market_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', _market_id);
END;
$$;
