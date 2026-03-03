
-- Balances table
CREATE TABLE public.balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USDT',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency)
);

ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own balance" ON public.balances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all balances" ON public.balances
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can update balances" ON public.balances
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert balances" ON public.balances
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Positions table
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  market_id uuid REFERENCES public.markets(id) ON DELETE CASCADE NOT NULL,
  option_id uuid REFERENCES public.market_options(id) ON DELETE CASCADE,
  side text NOT NULL DEFAULT 'yes',
  shares numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own positions" ON public.positions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Public aggregate positions" ON public.positions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own positions" ON public.positions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own positions" ON public.positions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Transactions table  
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  market_id uuid REFERENCES public.markets(id) ON DELETE SET NULL,
  option_id uuid REFERENCES public.market_options(id) ON DELETE SET NULL,
  side text,
  shares numeric,
  price numeric,
  tx_hash text,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own transactions" ON public.transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all transactions" ON public.transactions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Create balance automatically on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.balances (user_id, amount, currency)
  VALUES (NEW.id, 0, 'USDT');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_balance
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_balance();

-- Add image_url to markets table for consistency
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS trending boolean NOT NULL DEFAULT false;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS creator_name text NOT NULL DEFAULT 'Anonymous';
