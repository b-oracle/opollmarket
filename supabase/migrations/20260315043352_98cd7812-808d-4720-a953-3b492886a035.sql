ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS boost_flash_price numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS boost_standard_price numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS boost_whale_price numeric NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS broadcast_price numeric NOT NULL DEFAULT 5;