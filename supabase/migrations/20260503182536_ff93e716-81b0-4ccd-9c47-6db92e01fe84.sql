ALTER TABLE public.space_bans ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_space_bans_expires ON public.space_bans(expires_at);