DROP POLICY IF EXISTS "Users can view all memberships" ON public.community_memberships;
CREATE POLICY "Users can view own memberships" ON public.community_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_community_member_counts()
RETURNS TABLE(community_slug text, member_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT community_slug, count(*) FROM public.community_memberships GROUP BY community_slug
$$;
REVOKE ALL ON FUNCTION public.get_community_member_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_member_counts() TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read community messages" ON public.community_messages;
CREATE POLICY "Members can read community messages" ON public.community_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.community_memberships cm
               WHERE cm.user_id = auth.uid() AND cm.community_slug = community_messages.community_slug)
  );