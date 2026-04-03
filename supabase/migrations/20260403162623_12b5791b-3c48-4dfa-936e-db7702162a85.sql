CREATE TABLE public.space_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  tier text NOT NULL DEFAULT 'alert',
  created_at timestamptz DEFAULT now(),
  bonus_amount numeric DEFAULT 0
);

ALTER TABLE public.space_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own space broadcasts"
  ON public.space_broadcasts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own space broadcasts"
  ON public.space_broadcasts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());