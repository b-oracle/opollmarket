ALTER TABLE public.markets
  ADD COLUMN auto_resolve BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN auto_resolve_asset TEXT,
  ADD COLUMN auto_resolve_target_price NUMERIC,
  ADD COLUMN auto_resolve_operator TEXT,
  ADD COLUMN auto_resolve_deadline TIMESTAMPTZ;