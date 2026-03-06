
-- Quick Rounds table
CREATE TABLE public.quick_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL DEFAULT 'BTC',
  duration_seconds integer NOT NULL DEFAULT 300,
  open_price numeric,
  close_price numeric,
  status text NOT NULL DEFAULT 'open',
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  locks_at timestamptz NOT NULL DEFAULT (now() + interval '290 seconds'),
  resolved_at timestamptz
);

-- Quick Bets table
CREATE TABLE public.quick_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  round_id uuid NOT NULL REFERENCES public.quick_rounds(id) ON DELETE CASCADE,
  side text NOT NULL,
  amount numeric NOT NULL,
  payout numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quick_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_bets ENABLE ROW LEVEL SECURITY;

-- RLS for quick_rounds: publicly readable
CREATE POLICY "Quick rounds are publicly readable"
  ON public.quick_rounds FOR SELECT
  USING (true);

-- RLS for quick_bets
CREATE POLICY "Users can read own quick bets"
  ON public.quick_bets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all quick bets"
  ON public.quick_bets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own quick bets"
  ON public.quick_bets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_bets;
