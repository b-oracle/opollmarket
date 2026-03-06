
-- Table to track last known scores for live sports markets
CREATE TABLE public.sport_score_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  match_id text NOT NULL,
  home_score integer,
  away_score integer,
  status text,
  is_live boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(market_id)
);

-- No RLS needed — only accessed by edge functions via service role
ALTER TABLE public.sport_score_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (no user-facing policies needed)
CREATE POLICY "Service role access" ON public.sport_score_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);
