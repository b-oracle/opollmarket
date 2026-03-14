
ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS creator_fee_blue_percent numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS creator_fee_gold_percent numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS referrer_commission_percent numeric NOT NULL DEFAULT 0;
