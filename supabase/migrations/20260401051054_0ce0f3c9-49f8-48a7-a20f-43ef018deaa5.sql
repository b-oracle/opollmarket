INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('allow_unverified_spaces', 'Allow Unverified Users to Create/Co-host Spaces', false)
ON CONFLICT DO NOTHING;