
CREATE TABLE public.feature_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feature toggles"
  ON public.feature_toggles FOR SELECT USING (true);

CREATE POLICY "Super admins can manage feature toggles"
  ON public.feature_toggles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.feature_toggles (feature_key, label, enabled) VALUES
  ('feed', 'Live Feed', true),
  ('quick_trade', 'Quick Trade', true),
  ('create_market', 'Create Market', true),
  ('portfolio', 'Portfolio', true),
  ('rankings', 'Leaderboard', true),
  ('referrals', 'Referrals', true),
  ('social_profiles', 'Social Profiles', true),
  ('faq', 'FAQ', true);
