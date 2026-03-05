ALTER TABLE public.commission_settings 
ADD COLUMN IF NOT EXISTS token_contract_address text DEFAULT '',
ADD COLUMN IF NOT EXISTS nft_contract_address text DEFAULT '';