
-- Local timestamp helper (the public schema has no shared one)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Per-pair config table
CREATE TABLE public.crypto_round_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL,
  duration_minutes int NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  initial_liquidity_usd numeric NOT NULL DEFAULT 500,
  category text NOT NULL DEFAULT 'Crypto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset, duration_minutes),
  CHECK (asset ~ '^[A-Z]{2,8}$'),
  CHECK (duration_minutes > 0 AND duration_minutes <= 10080)
);

ALTER TABLE public.crypto_round_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crypto round config"
  ON public.crypto_round_config FOR SELECT USING (true);

CREATE POLICY "Admins manage crypto round config"
  ON public.crypto_round_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_crypto_round_config_updated
  BEFORE UPDATE ON public.crypto_round_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Per-market round metadata
CREATE TABLE public.crypto_round_meta (
  market_id uuid PRIMARY KEY REFERENCES public.markets(id) ON DELETE CASCADE,
  asset text NOT NULL,
  duration_minutes int NOT NULL,
  open_price numeric NOT NULL,
  close_price numeric,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crypto_round_meta_pair_end
  ON public.crypto_round_meta(asset, duration_minutes, end_time DESC);

ALTER TABLE public.crypto_round_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crypto round meta"
  ON public.crypto_round_meta FOR SELECT USING (true);

-- 3. Tag column on markets so the feed can render LIVE + countdown badge
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS is_crypto_round boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_markets_crypto_round
  ON public.markets(is_crypto_round) WHERE is_crypto_round = true;
