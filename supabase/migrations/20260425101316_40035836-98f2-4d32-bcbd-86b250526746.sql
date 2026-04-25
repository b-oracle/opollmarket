ALTER TABLE public.commission_settings
  ADD COLUMN IF NOT EXISTS deposit_overpay_threshold numeric NOT NULL DEFAULT 1.02,
  ADD COLUMN IF NOT EXISTS deposit_partial_threshold numeric NOT NULL DEFAULT 0.98,
  ADD COLUMN IF NOT EXISTS deposit_wrong_asset_high numeric NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS deposit_wrong_asset_low  numeric NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS deposit_large_overpay_alert numeric NOT NULL DEFAULT 1.5;