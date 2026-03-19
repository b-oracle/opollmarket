
-- Phase 1: Status Updates tables

-- Status updates (tweet-like posts)
CREATE TABLE public.status_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 280),
  image_url TEXT,
  likes_count INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Status likes
CREATE TABLE public.status_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_id UUID NOT NULL REFERENCES public.status_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (status_id, user_id)
);

-- Indexes
CREATE INDEX idx_status_updates_user_id ON public.status_updates(user_id);
CREATE INDEX idx_status_updates_created_at ON public.status_updates(created_at DESC);
CREATE INDEX idx_status_likes_status_id ON public.status_likes(status_id);
CREATE INDEX idx_status_likes_user_id ON public.status_likes(user_id);

-- Enable RLS
ALTER TABLE public.status_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_likes ENABLE ROW LEVEL SECURITY;

-- RLS for status_updates: anyone can read, authenticated users insert/delete own
CREATE POLICY "Anyone can read status updates"
  ON public.status_updates FOR SELECT
  USING (true);

CREATE POLICY "Users can create own status updates"
  ON public.status_updates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own status updates"
  ON public.status_updates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS for status_likes
CREATE POLICY "Anyone can read status likes"
  ON public.status_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can like statuses"
  ON public.status_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike statuses"
  ON public.status_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update likes_count on status_updates
CREATE OR REPLACE FUNCTION public.update_status_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.status_updates SET likes_count = likes_count + 1 WHERE id = NEW.status_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.status_updates SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.status_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER on_status_like_change
AFTER INSERT OR DELETE ON public.status_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_status_likes_count();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.status_updates;

-- Storage bucket for social media images
INSERT INTO storage.buckets (id, name, public) VALUES ('social-media', 'social-media', true);

-- Storage policies
CREATE POLICY "Social media images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'social-media');

CREATE POLICY "Authenticated users can upload social media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own social media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'social-media' AND auth.uid()::text = (storage.foldername(name))[1]);
