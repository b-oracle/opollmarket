
-- Add repost tracking
CREATE TABLE public.status_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id uuid NOT NULL REFERENCES public.status_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(status_id, user_id)
);

ALTER TABLE public.status_reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reposts" ON public.status_reposts FOR SELECT USING (true);
CREATE POLICY "Users can insert own reposts" ON public.status_reposts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own reposts" ON public.status_reposts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add reposts_count to status_updates
ALTER TABLE public.status_updates ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0;

-- Trigger to sync reposts_count
CREATE OR REPLACE FUNCTION public.update_status_reposts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.status_updates SET reposts_count = reposts_count + 1 WHERE id = NEW.status_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.status_updates SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.status_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_status_reposts_count
AFTER INSERT OR DELETE ON public.status_reposts
FOR EACH ROW EXECUTE FUNCTION public.update_status_reposts_count();

CREATE INDEX idx_status_reposts_user ON public.status_reposts(user_id);
CREATE INDEX idx_status_reposts_status ON public.status_reposts(status_id);
