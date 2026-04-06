ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS allow_dm_gifts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_dm_money boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_gift_animations boolean NOT NULL DEFAULT true;