
-- Comments table with support for replies via parent_id
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT NOT NULL,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  author_wallet TEXT,
  content TEXT NOT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by market
CREATE INDEX idx_comments_market_id ON public.comments(market_id);
CREATE INDEX idx_comments_parent_id ON public.comments(parent_id);

-- Comment likes table to track who liked what
CREATE TABLE public.comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE NOT NULL,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, wallet_address)
);

-- Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Public read access for comments
CREATE POLICY "Anyone can read comments"
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can insert comments (wallet-based identity, no auth required)
CREATE POLICY "Anyone can insert comments"
  ON public.comments FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Public read access for likes
CREATE POLICY "Anyone can read comment likes"
  ON public.comment_likes FOR SELECT
  TO anon, authenticated
  USING (true);

-- Anyone can insert likes
CREATE POLICY "Anyone can insert comment likes"
  ON public.comment_likes FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anyone can delete their own likes
CREATE POLICY "Anyone can delete own comment likes"
  ON public.comment_likes FOR DELETE
  TO anon, authenticated
  USING (true);

-- Function to increment/decrement likes_count
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments SET likes_count = likes_count - 1 WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER on_comment_like_change
  AFTER INSERT OR DELETE ON public.comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_comment_likes_count();

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
