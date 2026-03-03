
CREATE POLICY "Public can read referral rewards for leaderboard"
ON public.referral_rewards
FOR SELECT
TO authenticated
USING (true);
