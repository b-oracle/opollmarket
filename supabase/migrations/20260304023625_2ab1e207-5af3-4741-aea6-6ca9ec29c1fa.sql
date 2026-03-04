ALTER TABLE public.commission_settings 
ADD COLUMN min_token_balance numeric NOT NULL DEFAULT 10000000,
ADD COLUMN min_nft_balance integer NOT NULL DEFAULT 1;