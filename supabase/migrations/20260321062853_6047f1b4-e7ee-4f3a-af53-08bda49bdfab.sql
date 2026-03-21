
-- Add parent_id for threaded replies
ALTER TABLE public.status_comments ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.status_comments(id) ON DELETE CASCADE;
ALTER TABLE public.status_comments ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;

-- Create status_comment_likes table
CREATE TABLE public.status_comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.status_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

ALTER TABLE public.status_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comment likes" ON public.status_comment_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert own likes" ON public.status_comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own likes" ON public.status_comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger to sync likes_count
CREATE OR REPLACE FUNCTION public.update_status_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.status_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.status_comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_status_comment_likes_count
AFTER INSERT OR DELETE ON public.status_comment_likes
FOR EACH ROW EXECUTE FUNCTION public.update_status_comment_likes_count();

-- Index for performance
CREATE INDEX idx_status_comments_parent_id ON public.status_comments(parent_id);
CREATE INDEX idx_status_comment_likes_comment_id ON public.status_comment_likes(comment_id);
