
DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;
CREATE POLICY "Authenticated users can read app_settings"
ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.validate_app_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v numeric;
BEGIN
  IF NEW.key = 'bsc_max_auto_credit_usd' THEN
    BEGIN v := NEW.value::text::numeric;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'bsc_max_auto_credit_usd must be numeric'; END;
    IF v IS NULL OR v <= 0 OR v > 1000000 THEN
      RAISE EXCEPTION 'bsc_max_auto_credit_usd must be > 0 and <= 1,000,000 (got %)', v;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_app_settings ON public.app_settings;
CREATE TRIGGER trg_validate_app_settings
BEFORE INSERT OR UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_app_settings();

CREATE OR REPLACE FUNCTION public.advance_bsc_scan_state(_to bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_val bigint;
BEGIN
  INSERT INTO public.bsc_deposit_state (id, last_scanned_block, updated_at)
  VALUES (1, _to, now())
  ON CONFLICT (id) DO UPDATE
    SET last_scanned_block = GREATEST(public.bsc_deposit_state.last_scanned_block, EXCLUDED.last_scanned_block),
        updated_at = now()
  RETURNING last_scanned_block INTO current_val;
  RETURN current_val;
END; $$;
REVOKE ALL ON FUNCTION public.advance_bsc_scan_state(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_bsc_scan_state(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.try_bsc_poller_lock()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pg_try_advisory_lock(hashtext('bsc-deposit-poller')::bigint);
$$;
CREATE OR REPLACE FUNCTION public.release_bsc_poller_lock()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pg_advisory_unlock(hashtext('bsc-deposit-poller')::bigint);
$$;
REVOKE ALL ON FUNCTION public.try_bsc_poller_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_bsc_poller_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_bsc_poller_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_bsc_poller_lock() TO service_role;

CREATE OR REPLACE FUNCTION public.bsc_user_24h_total_usd(_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount_usd), 0)::numeric
  FROM public.bsc_deposit_events
  WHERE user_id = _user_id
    AND status IN ('detected', 'credited', 'manual_review')
    AND detected_at > now() - interval '24 hours';
$$;
REVOKE ALL ON FUNCTION public.bsc_user_24h_total_usd(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bsc_user_24h_total_usd(uuid) TO service_role;
