DROP POLICY IF EXISTS "Members can read community messages" ON public.community_messages;
CREATE POLICY "Authenticated users can read community messages" ON public.community_messages FOR SELECT TO authenticated USING (true);
ALTER FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) SECURITY DEFINER;
ALTER FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_quick_round(text, integer, numeric, timestamptz) TO authenticated;