
CREATE TABLE IF NOT EXISTS public.bsc_sweep_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  address TEXT NOT NULL,
  hd_index INTEGER NOT NULL,
  token TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  amount_wei NUMERIC NOT NULL DEFAULT 0,
  amount_usd NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  treasury_address TEXT,
  gas_tx_hash TEXT,
  gas_funded_at TIMESTAMPTZ,
  sweep_tx_hash TEXT,
  swept_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsc_sweep_jobs_status ON public.bsc_sweep_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_bsc_sweep_jobs_address ON public.bsc_sweep_jobs(address);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bsc_sweep_jobs_active
  ON public.bsc_sweep_jobs(address, token)
  WHERE status IN ('queued','gas_funded','swept');

ALTER TABLE public.bsc_sweep_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sweep jobs"
  ON public.bsc_sweep_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update sweep jobs"
  ON public.bsc_sweep_jobs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER bsc_sweep_jobs_updated_at
  BEFORE UPDATE ON public.bsc_sweep_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
