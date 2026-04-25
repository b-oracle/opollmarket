ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS gross_amount_usd numeric,
  ADD COLUMN IF NOT EXISTS net_amount_usd numeric;

COMMENT ON COLUMN public.transactions.gross_amount_usd IS 'Total USD value received from payment provider (including overpayments)';
COMMENT ON COLUMN public.transactions.net_amount_usd IS 'Net USD amount creditable to user after provider fees';