ALTER TABLE public.commission_settings 
ADD COLUMN IF NOT EXISTS nft_buy_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS market_creation_fee numeric DEFAULT 50;