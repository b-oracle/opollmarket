INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('crypto_up_down', 'Crypto Up & Down', true)
ON CONFLICT (feature_key) DO NOTHING;