CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_rounds_one_active_per_asset_duration
ON public.quick_rounds (asset, duration_seconds)
WHERE status IN ('open', 'locked');

GRANT SELECT, INSERT ON public.quick_rounds TO anon;
GRANT SELECT, INSERT ON public.quick_rounds TO authenticated;
GRANT ALL ON public.quick_rounds TO service_role;

DROP POLICY IF EXISTS "Validated public quick round creation" ON public.quick_rounds;
CREATE POLICY "Validated public quick round creation"
ON public.quick_rounds
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'open'
  AND asset IN (
    'BTC','ETH','BNB','SOL','XRP','DOGE',
    'XAU','XAG','XPT','XPD',
    'BRENT','WTI','NG','COPPER',
    'EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP'
  )
  AND duration_seconds IN (60, 180, 300, 900)
  AND open_price IS NOT NULL
  AND open_price > 0
  AND open_price < 10000000
  AND close_price IS NULL
  AND result IS NULL
  AND resolved_at IS NULL
  AND locks_at >= now()
  AND locks_at <= now() + interval '16 minutes'
  AND created_at >= now() - interval '10 seconds'
  AND created_at <= now() + interval '10 seconds'
);

CREATE OR REPLACE FUNCTION public.create_quick_round(
  _asset text,
  _duration_seconds integer,
  _open_price numeric,
  _locks_at timestamptz
)
RETURNS public.quick_rounds
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.quick_rounds;
  v_asset text := upper(trim(_asset));
BEGIN
  IF v_asset NOT IN (
    'BTC','ETH','BNB','SOL','XRP','DOGE',
    'XAU','XAG','XPT','XPD',
    'BRENT','WTI','NG','COPPER',
    'EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/GBP'
  ) THEN
    RAISE EXCEPTION 'Invalid asset: %', v_asset;
  END IF;

  IF _duration_seconds NOT IN (60, 180, 300, 900) THEN
    RAISE EXCEPTION 'Invalid duration: %', _duration_seconds;
  END IF;

  IF _open_price IS NULL OR _open_price <= 0 OR _open_price >= 10000000 THEN
    RAISE EXCEPTION 'Invalid open price';
  END IF;

  IF _locks_at IS NULL OR _locks_at < now() OR _locks_at > now() + interval '16 minutes' THEN
    RAISE EXCEPTION 'Invalid lock time';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('quick_round:' || v_asset || ':' || _duration_seconds::text));

  SELECT * INTO v_row
  FROM public.quick_rounds
  WHERE asset = v_asset
    AND duration_seconds = _duration_seconds
    AND status IN ('open','locked')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.quick_rounds (asset, duration_seconds, open_price, status, locks_at)
  VALUES (v_asset, _duration_seconds, _open_price, 'open', _locks_at)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) TO service_role;