
ALTER TABLE public.telegram_link_sessions ENABLE ROW LEVEL SECURITY;

-- No client-side access needed - only service role uses this table
CREATE POLICY "No public access to link sessions"
  ON public.telegram_link_sessions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
