
CREATE TABLE public.pending_copy_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  trader_user_id uuid NOT NULL,
  trade_type text NOT NULL DEFAULT 'prediction',
  market_id uuid REFERENCES public.markets(id),
  option_id uuid REFERENCES public.market_options(id),
  side text,
  amount numeric NOT NULL,
  price numeric,
  shares numeric,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '2 minutes'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_copy_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own pending copy trades"
  ON public.pending_copy_trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own pending copy trades"
  ON public.pending_copy_trades FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_copy_trades;
