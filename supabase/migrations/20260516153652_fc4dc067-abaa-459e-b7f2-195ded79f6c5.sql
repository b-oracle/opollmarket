ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_no_self_referral;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_no_self_referral CHECK (referred_by IS NULL OR referred_by <> id);