
-- Create quick_trade_streaks table
CREATE TABLE public.quick_trade_streaks (
  user_id uuid NOT NULL PRIMARY KEY,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quick_trade_streaks ENABLE ROW LEVEL SECURITY;

-- Users can read their own streak
CREATE POLICY "Users can read own streak"
  ON public.quick_trade_streaks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add streak column to quick_bets
ALTER TABLE public.quick_bets ADD COLUMN streak integer NOT NULL DEFAULT 0;
