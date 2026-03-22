
-- Add views_count to status_updates
ALTER TABLE public.status_updates ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0;

-- Create a table to track unique views per post per user
CREATE TABLE IF NOT EXISTS public.status_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id uuid NOT NULL REFERENCES public.status_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(status_id, user_id)
);

-- Enable RLS
ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

-- Users can insert their own views
CREATE POLICY "Users can insert own views"
  ON public.status_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Anyone authenticated can read view counts (needed for count queries)
CREATE POLICY "Anyone can read views"
  ON public.status_views FOR SELECT
  TO authenticated
  USING (true);

-- Trigger to increment views_count on status_updates
CREATE OR REPLACE FUNCTION public.update_status_views_count()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.status_updates SET views_count = views_count + 1 WHERE id = NEW.status_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.status_updates SET views_count = GREATEST(0, views_count - 1) WHERE id = OLD.status_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_update_status_views_count
  AFTER INSERT OR DELETE ON public.status_views
  FOR EACH ROW EXECUTE FUNCTION public.update_status_views_count();
