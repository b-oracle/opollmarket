
CREATE TABLE public.crypto_round_spawn_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT,
  duration_minutes INTEGER,
  market_id UUID REFERENCES public.markets(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  actor_id UUID,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  open_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crypto_round_spawn_log_created_at ON public.crypto_round_spawn_log (created_at DESC);
CREATE INDEX idx_crypto_round_spawn_log_asset_dur ON public.crypto_round_spawn_log (asset, duration_minutes, created_at DESC);

ALTER TABLE public.crypto_round_spawn_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view spawn log"
ON public.crypto_round_spawn_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);
