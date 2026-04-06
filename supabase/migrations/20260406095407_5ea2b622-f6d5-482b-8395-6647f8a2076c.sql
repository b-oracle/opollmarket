ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS max_drafts_none integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_drafts_blue integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_drafts_gold integer NOT NULL DEFAULT 10;