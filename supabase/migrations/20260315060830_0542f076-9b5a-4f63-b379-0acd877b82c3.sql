
-- Add prediction_fee_percent as the single flat fee (default 10%)
-- The existing admin_fee_percent, creator_fee_percent, etc. become "split" percentages
-- that represent how the flat fee is divided internally (must sum to 100)
ALTER TABLE public.commission_settings
ADD COLUMN IF NOT EXISTS prediction_fee_percent numeric NOT NULL DEFAULT 10;

-- Add comment for clarity
COMMENT ON COLUMN public.commission_settings.prediction_fee_percent IS 'Single flat prediction fee charged on each wager (e.g. 10 = 10%)';
COMMENT ON COLUMN public.commission_settings.admin_fee_percent IS 'Split: % of prediction fee kept by platform (internal split, sums to 100 with other splits)';
COMMENT ON COLUMN public.commission_settings.creator_fee_percent IS 'Split: % of prediction fee paid to unverified creators';
COMMENT ON COLUMN public.commission_settings.creator_fee_blue_percent IS 'Split: % of prediction fee paid to blue-verified creators';
COMMENT ON COLUMN public.commission_settings.creator_fee_gold_percent IS 'Split: % of prediction fee paid to gold-verified creators';
COMMENT ON COLUMN public.commission_settings.referrer_commission_percent IS 'Split: % of prediction fee paid to referrer';
COMMENT ON COLUMN public.commission_settings.bc400_pool_percent IS 'Split: % of prediction fee allocated to BC400 pool';
