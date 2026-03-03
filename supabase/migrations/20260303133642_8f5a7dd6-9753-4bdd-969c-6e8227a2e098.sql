CREATE TABLE public.market_boosts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id UUID REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('flash', 'standard', 'whale')),
  amount NUMERIC NOT NULL,
  tx_hash TEXT,
  payer_wallet TEXT NOT NULL,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.market_boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Boosts are publicly readable" ON public.market_boosts FOR SELECT USING (true);
CREATE POLICY "Anyone can create boosts" ON public.market_boosts FOR INSERT WITH CHECK (true);
CREATE POLICY "Boosts can be updated" ON public.market_boosts FOR UPDATE USING (true) WITH CHECK (true);