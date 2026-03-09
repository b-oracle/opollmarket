INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('social_tutorial', 'Social Tutorial', true)
ON CONFLICT DO NOTHING;