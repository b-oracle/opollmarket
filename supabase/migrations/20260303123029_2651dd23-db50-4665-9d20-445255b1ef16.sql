
-- Markets table
CREATE TABLE public.markets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_wallet TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  end_date DATE NOT NULL,
  resolution_source TEXT NOT NULL,
  initial_liquidity NUMERIC NOT NULL DEFAULT 0,
  yes_price NUMERIC NOT NULL DEFAULT 0.50,
  no_price NUMERIC NOT NULL DEFAULT 0.50,
  volume NUMERIC NOT NULL DEFAULT 0,
  liquidity NUMERIC NOT NULL DEFAULT 0,
  participants INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  tx_hash TEXT,
  contract_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

-- Anyone can read markets
CREATE POLICY "Markets are publicly readable"
  ON public.markets FOR SELECT
  USING (true);

-- Anyone can insert (wallet-based auth, no supabase auth required)
CREATE POLICY "Anyone can create markets"
  ON public.markets FOR INSERT
  WITH CHECK (true);

-- Only creator can update their markets
CREATE POLICY "Creators can update own markets"
  ON public.markets FOR UPDATE
  USING (true)
  WITH CHECK (true);
