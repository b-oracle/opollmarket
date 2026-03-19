
-- Create status_comments table
CREATE TABLE public.status_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES public.status_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.status_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments
CREATE POLICY "Anyone can read status comments"
ON public.status_comments FOR SELECT
USING (true);

-- Authenticated users can insert own comments
CREATE POLICY "Users can insert own status comments"
ON public.status_comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can delete own comments
CREATE POLICY "Users can delete own status comments"
ON public.status_comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add comments_count to status_updates
ALTER TABLE public.status_updates ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0;

-- Create trigger to auto-increment/decrement comments_count
CREATE OR REPLACE FUNCTION public.update_status_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.status_updates SET comments_count = comments_count + 1 WHERE id = NEW.status_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.status_updates SET comments_count = comments_count - 1 WHERE id = OLD.status_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_status_comments_count_trigger
AFTER INSERT OR DELETE ON public.status_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_status_comments_count();

-- Index for performance
CREATE INDEX idx_status_comments_status_id ON public.status_comments(status_id);
CREATE INDEX idx_status_comments_user_id ON public.status_comments(user_id);
