
-- Add unique constraint to prevent duplicate options per market
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_options_unique_label 
ON public.market_options (market_id, label);
