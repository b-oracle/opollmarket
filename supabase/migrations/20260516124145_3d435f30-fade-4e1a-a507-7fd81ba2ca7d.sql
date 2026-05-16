ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS expected_amount_ngn numeric,
  ADD COLUMN IF NOT EXISTS exchange_rate_ngn numeric;