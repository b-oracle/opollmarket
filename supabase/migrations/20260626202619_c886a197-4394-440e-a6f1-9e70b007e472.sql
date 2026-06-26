
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS simulated_liquidity numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.admin_set_market_spoof(
  _market_id uuid,
  _spoof_volume numeric,
  _spoof_participants integer,
  _spoof_liquidity numeric DEFAULT NULL
)
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

  SELECT jsonb_build_object(
    'simulated_volume', simulated_volume,
    'simulated_participants', simulated_participants,
    'simulated_liquidity', simulated_liquidity
  )
    INTO _before FROM public.markets WHERE id = _market_id;

  UPDATE public.markets
  SET simulated_volume = COALESCE(_spoof_volume, 0),
      simulated_participants = COALESCE(_spoof_participants, 0),
      simulated_liquidity = COALESCE(_spoof_liquidity, simulated_liquidity, 0)
  WHERE id = _market_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'market_spoof_update',
    'market',
    _market_id,
    jsonb_build_object(
      'before', _before,
      'after', jsonb_build_object(
        'simulated_volume', _spoof_volume,
        'simulated_participants', _spoof_participants,
        'simulated_liquidity', _spoof_liquidity
      )
    )
  );
END;
$function$;
