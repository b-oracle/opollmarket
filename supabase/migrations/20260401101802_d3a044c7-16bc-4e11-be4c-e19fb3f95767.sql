ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS user_agent text;