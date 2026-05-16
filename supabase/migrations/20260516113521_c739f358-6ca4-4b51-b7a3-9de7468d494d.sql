CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  source text NOT NULL,
  code text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_unack
  ON public.system_alerts (severity, created_at DESC)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_alerts_source_code_recent
  ON public.system_alerts (source, code, created_at DESC);

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read system_alerts" ON public.system_alerts;
CREATE POLICY "Admins read system_alerts"
  ON public.system_alerts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Admins ack system_alerts" ON public.system_alerts;
CREATE POLICY "Admins ack system_alerts"
  ON public.system_alerts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.record_system_alert(
  _severity text,
  _source text,
  _code text,
  _message text,
  _details jsonb DEFAULT '{}'::jsonb,
  _dedupe_minutes integer DEFAULT 10
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing uuid;
  _id uuid;
BEGIN
  IF _severity NOT IN ('info','warning','critical') THEN
    RAISE EXCEPTION 'invalid severity %', _severity;
  END IF;

  -- Dedupe: if an unacked alert with same source+code exists within window, bump details + return it
  SELECT id INTO _existing
  FROM public.system_alerts
  WHERE source = _source
    AND code = _code
    AND acknowledged_at IS NULL
    AND created_at >= (now() - make_interval(mins => _dedupe_minutes))
  ORDER BY created_at DESC
  LIMIT 1;

  IF _existing IS NOT NULL THEN
    UPDATE public.system_alerts
    SET details = details || jsonb_build_object(
      'last_seen_at', now(),
      'occurrences', COALESCE((details->>'occurrences')::int, 1) + 1,
      'last_message', _message,
      'last_details', _details
    )
    WHERE id = _existing;
    RETURN _existing;
  END IF;

  INSERT INTO public.system_alerts (severity, source, code, message, details)
  VALUES (_severity, _source, _code, _message,
    _details || jsonb_build_object('occurrences', 1, 'first_seen_at', now()))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_system_alert(text,text,text,text,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_system_alert(text,text,text,text,jsonb,integer) TO service_role;