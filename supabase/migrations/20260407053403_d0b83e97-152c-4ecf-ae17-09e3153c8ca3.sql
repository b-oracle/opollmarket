
-- Restrict follows SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can read follows" ON public.follows;
CREATE POLICY "Authenticated can read follows" ON public.follows
  FOR SELECT TO authenticated USING (true);

-- Restrict market_likes SELECT to authenticated
DROP POLICY IF EXISTS "Market likes are publicly readable" ON public.market_likes;
CREATE POLICY "Market likes readable by authenticated" ON public.market_likes
  FOR SELECT TO authenticated USING (true);

-- Restrict story_views SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can read story views" ON public.story_views;
CREATE POLICY "Story views readable by authenticated" ON public.story_views
  FOR SELECT TO authenticated USING (true);
