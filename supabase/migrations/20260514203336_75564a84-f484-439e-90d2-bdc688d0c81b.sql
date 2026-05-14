REVOKE EXECUTE ON FUNCTION public.get_user_referral_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_referral_count(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_referral_count(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_referral_signups(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_referral_signups(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_referral_signups(uuid) TO authenticated;