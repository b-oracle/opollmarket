ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS sport_type TEXT,
  ADD COLUMN IF NOT EXISTS sport_match_id TEXT,
  ADD COLUMN IF NOT EXISTS sport_predicted_outcome TEXT,
  ADD COLUMN IF NOT EXISTS sport_league TEXT;