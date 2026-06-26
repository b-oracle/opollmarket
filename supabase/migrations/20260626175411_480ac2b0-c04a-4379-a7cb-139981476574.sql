
-- Platform-wide spoofed stats overrides (single row)
CREATE TABLE IF NOT EXISTS public.platform_stats_overrides (
  id boolean PRIMARY KEY DEFAULT true,
  spoof_volume numeric NOT NULL DEFAULT 0,
  spoof_users integer NOT NULL DEFAULT 0,
  spoof_markets integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = true)
);

GRANT SELECT ON public.platform_stats_overrides TO authenticated, anon;
GRANT ALL ON public.platform_stats_overrides TO service_role;

ALTER TABLE public.platform_stats_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read overrides"
  ON public.platform_stats_overrides FOR SELECT
  USING (true);

CREATE POLICY "Super admin manages overrides"
  ON public.platform_stats_overrides FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.platform_stats_overrides (id) VALUES (true)
  ON CONFLICT (id) DO NOTHING;

-- Updated platform volume RPC: real + per-market simulated + override
CREATE OR REPLACE FUNCTION public.get_platform_volume()
RETURNS TABLE(prediction_volume numeric, qt_volume numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE((SELECT SUM(volume) + SUM(COALESCE(simulated_volume, 0)) FROM public.markets), 0)
      + COALESCE((SELECT CASE WHEN enabled THEN spoof_volume ELSE 0 END FROM public.platform_stats_overrides WHERE id = true), 0)
      AS prediction_volume,
    COALESCE((SELECT SUM(amount) FROM public.quick_bets WHERE status IN ('won', 'lost')), 0) AS qt_volume;
$$;

-- Updated user count RPC: real + spoof
CREATE OR REPLACE FUNCTION public.get_platform_user_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    (SELECT COUNT(*)::integer FROM public.profiles)
    + COALESCE((SELECT CASE WHEN enabled THEN spoof_users ELSE 0 END FROM public.platform_stats_overrides WHERE id = true), 0)
  );
$$;

-- New: market count with spoof boost
CREATE OR REPLACE FUNCTION public.get_platform_market_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    (SELECT COUNT(*)::integer FROM public.markets WHERE is_hidden = false)
    + COALESCE((SELECT CASE WHEN enabled THEN spoof_markets ELSE 0 END FROM public.platform_stats_overrides WHERE id = true), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_market_count() TO anon, authenticated;

-- Super-admin RPCs to manage spoof values (with audit trail)
CREATE OR REPLACE FUNCTION public.admin_set_platform_overrides(
  _volume numeric,
  _users integer,
  _markets integer,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _before jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  SELECT to_jsonb(p) INTO _before FROM public.platform_stats_overrides p WHERE id = true;

  UPDATE public.platform_stats_overrides
  SET spoof_volume = _volume,
      spoof_users = _users,
      spoof_markets = _markets,
      enabled = _enabled,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = true;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'spoof_stats_update',
    'platform_stats_overrides',
    NULL,
    jsonb_build_object(
      'before', _before,
      'after', jsonb_build_object('spoof_volume', _volume, 'spoof_users', _users, 'spoof_markets', _markets, 'enabled', _enabled)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_platform_overrides(numeric, integer, integer, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_market_spoof(
  _market_id uuid,
  _spoof_volume numeric,
  _spoof_participants integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _before jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  SELECT jsonb_build_object('simulated_volume', simulated_volume, 'simulated_participants', simulated_participants)
    INTO _before FROM public.markets WHERE id = _market_id;

  UPDATE public.markets
  SET simulated_volume = COALESCE(_spoof_volume, 0),
      simulated_participants = COALESCE(_spoof_participants, 0)
  WHERE id = _market_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'market_spoof_update',
    'market',
    _market_id,
    jsonb_build_object(
      'before', _before,
      'after', jsonb_build_object('simulated_volume', _spoof_volume, 'simulated_participants', _spoof_participants)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_market_spoof(uuid, numeric, integer) TO authenticated;
