
CREATE OR REPLACE FUNCTION public.admin_set_market_spoof(_market_id uuid, _spoof_volume numeric, _spoof_participants integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_platform_overrides(_volume numeric, _users integer, _markets integer, _enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
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
$function$;
