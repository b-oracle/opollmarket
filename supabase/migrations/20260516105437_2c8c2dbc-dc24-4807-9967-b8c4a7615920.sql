
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_settings"
  ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Super admins manage app_settings"
  ON public.app_settings FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'bsc_max_auto_credit_usd',
  to_jsonb(5000::numeric),
  'Maximum USD amount of a single BSC deposit that auto-credits. Larger deposits are flagged for manual review.'
)
ON CONFLICT (key) DO NOTHING;
