INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('jamendo_music', 'Jamendo Free Music Streaming', false)
ON CONFLICT (feature_key) DO UPDATE SET enabled = false, updated_at = now();