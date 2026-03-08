
ALTER TABLE public.feature_toggles
  ADD COLUMN scheduled_start timestamptz DEFAULT NULL,
  ADD COLUMN scheduled_end timestamptz DEFAULT NULL;
