
-- Create market_likes table for tracking likes on markets
CREATE TABLE public.market_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(market_id, user_id)
);

-- Enable RLS
ALTER TABLE public.market_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can read like counts
CREATE POLICY "Market likes are publicly readable"
  ON public.market_likes FOR SELECT
  USING (true);

-- Authenticated users can insert own likes
CREATE POLICY "Users can insert own market likes"
  ON public.market_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can delete own likes
CREATE POLICY "Users can delete own market likes"
  ON public.market_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
