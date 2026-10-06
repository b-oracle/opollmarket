CREATE TABLE public.howto_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id text NOT NULL,
  title text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.howto_videos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.howto_videos TO authenticated;
GRANT ALL ON public.howto_videos TO service_role;
ALTER TABLE public.howto_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view howto videos" ON public.howto_videos FOR SELECT USING (true);
CREATE POLICY "Staff manage howto videos" ON public.howto_videos FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'support'));