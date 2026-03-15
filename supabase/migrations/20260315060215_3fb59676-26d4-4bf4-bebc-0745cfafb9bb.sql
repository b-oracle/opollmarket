
-- Create pending_commissions table
CREATE TABLE public.pending_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  market_id uuid REFERENCES public.markets(id),
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'creator',
  status text NOT NULL DEFAULT 'pending',
  releases_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  trade_transaction_id uuid REFERENCES public.transactions(id)
);

-- Enable RLS
ALTER TABLE public.pending_commissions ENABLE ROW LEVEL SECURITY;

-- Users can read own pending commissions
CREATE POLICY "Users can read own pending commissions"
  ON public.pending_commissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all pending commissions
CREATE POLICY "Admins can read all pending commissions"
  ON public.pending_commissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
