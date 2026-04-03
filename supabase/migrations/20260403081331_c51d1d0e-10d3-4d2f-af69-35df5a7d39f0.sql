ALTER TABLE public.commission_settings
  ADD COLUMN welcome_bonus_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN welcome_bonus_cap numeric NOT NULL DEFAULT 0;

INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('welcome_bonus', 'Welcome Bonus (First Deposit)', false)
ON CONFLICT DO NOTHING;