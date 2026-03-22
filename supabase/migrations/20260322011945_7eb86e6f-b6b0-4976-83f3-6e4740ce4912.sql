ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS block_reason text;