CREATE TABLE IF NOT EXISTS public.community_reads (
  user_id UUID NOT NULL,
  community_slug TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, community_slug)
);

ALTER TABLE public.community_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own community reads"
  ON public.community_reads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own community reads"
  ON public.community_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own community reads"
  ON public.community_reads FOR UPDATE
  USING (auth.uid() = user_id);
