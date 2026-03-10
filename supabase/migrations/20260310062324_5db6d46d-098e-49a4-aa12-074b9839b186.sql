CREATE TABLE IF NOT EXISTS public.commodity_price_cache (
  asset TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Public read, service-role write (edge function uses service key)
ALTER TABLE public.commodity_price_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read commodity cache"
  ON public.commodity_price_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);