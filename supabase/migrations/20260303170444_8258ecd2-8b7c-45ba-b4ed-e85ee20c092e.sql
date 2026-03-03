
-- Add referred_by to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by uuid;

-- Add bonus_balance to balances
ALTER TABLE public.balances ADD COLUMN IF NOT EXISTS bonus_balance numeric NOT NULL DEFAULT 0;

-- Add referral_reward_amount to commission_settings
ALTER TABLE public.commission_settings ADD COLUMN IF NOT EXISTS referral_reward_amount numeric NOT NULL DEFAULT 5;

-- Create referral_rewards table
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(referred_id)
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Users can read their own referral rewards (as referrer)
CREATE POLICY "Users can read own referral rewards"
  ON public.referral_rewards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id);

-- Admins can read all referral rewards
CREATE POLICY "Admins can read all referral rewards"
  ON public.referral_rewards
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- System can insert referral rewards
CREATE POLICY "Users can insert referral rewards"
  ON public.referral_rewards
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
