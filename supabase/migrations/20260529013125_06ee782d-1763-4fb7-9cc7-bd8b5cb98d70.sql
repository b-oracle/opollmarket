
-- Restore Quick Trade round creation for authenticated users via a SECURITY DEFINER RPC.
-- The admin-only RLS policy from May 5 broke client-side round creation for non-admins,
-- causing the timer to stay at 00:00 because no new round could be inserted.

-- 1) Restore base GRANTs (table currently has none, blocking PostgREST entirely).
GRANT SELECT ON public.quick_rounds TO anon, authenticated;
GRANT ALL ON public.quick_rounds TO service_role;

-- 2) Validated, SECURITY DEFINER round creator. Idempotent: if another caller
--    raced and an open/locked round already exists for (asset, duration_seconds),
--    return that one instead of inserting a duplicate.
CREATE OR REPLACE FUNCTION public.create_quick_round(
  _asset text,
  _duration_seconds integer,
  _open_price numeric,
  _locks_at timestamptz
)
RETURNS public.quick_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.quick_rounds;
  v_asset text := upper(_asset);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Whitelist allowed assets / durations to prevent abuse.
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

  IF _open_price IS NULL OR _open_price <= 0 THEN
    RAISE EXCEPTION 'Invalid open price';
  END IF;

  -- Reuse any existing open/locked round for this pair to avoid duplicates.
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
GRANT EXECUTE ON FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) TO authenticated;
