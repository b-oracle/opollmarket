
-- Create limit_orders table
CREATE TABLE public.limit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  option_id uuid REFERENCES public.market_options(id) ON DELETE SET NULL,
  side text NOT NULL DEFAULT 'yes',
  order_type text NOT NULL DEFAULT 'limit',
  limit_price numeric NOT NULL,
  amount numeric NOT NULL,
  shares numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.limit_orders ENABLE ROW LEVEL SECURITY;

-- Users can read own orders
CREATE POLICY "Users can read own limit orders"
  ON public.limit_orders FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can read all limit orders"
  ON public.limit_orders FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Public can read pending orders (for order book display)
CREATE POLICY "Anyone can read pending limit orders"
  ON public.limit_orders FOR SELECT
  USING (status = 'pending');

-- Users can insert own orders
CREATE POLICY "Users can insert own limit orders"
  ON public.limit_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update own orders (cancel)
CREATE POLICY "Users can update own limit orders"
  ON public.limit_orders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.limit_orders;
