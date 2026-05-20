CREATE TABLE IF NOT EXISTS public.bsc_rescan_cooldowns (
  user_id UUID PRIMARY KEY,
  last_rescan_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bsc_rescan_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own rescan cooldown" ON public.bsc_rescan_cooldowns
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Writes only via service role (no policy needed; service role bypasses RLS).