
CREATE TABLE public.market_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id),
  user_id uuid NOT NULL,
  tier text NOT NULL DEFAULT 'alert',
  amount numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  nowpayments_payment_id text,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broadcasts publicly readable" ON public.market_broadcasts FOR SELECT USING (true);
CREATE POLICY "Users can create own broadcasts" ON public.market_broadcasts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update broadcasts" ON public.market_broadcasts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
