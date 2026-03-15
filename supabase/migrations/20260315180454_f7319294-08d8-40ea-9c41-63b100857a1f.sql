INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('poly_chart', 'Polymarket-Style Chart', true)
ON CONFLICT (feature_key) DO NOTHING;