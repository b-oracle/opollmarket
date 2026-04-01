ALTER TABLE public.commission_settings ADD COLUMN IF NOT EXISTS kyc_tier1_daily_limit numeric NOT NULL DEFAULT 500;
ALTER TABLE public.commission_settings ADD COLUMN IF NOT EXISTS kyc_tier2_daily_limit numeric NOT NULL DEFAULT 50000;
ALTER TABLE public.commission_settings ADD COLUMN IF NOT EXISTS max_daily_withdrawals integer NOT NULL DEFAULT 5;