
-- Phase 2: Stories tables
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  image_url TEXT,
  background_color TEXT DEFAULT '#1a1a2e',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, viewer_id)
);

CREATE INDEX idx_stories_user_id ON public.stories(user_id);
CREATE INDEX idx_stories_expires_at ON public.stories(expires_at);
CREATE INDEX idx_story_views_story_id ON public.story_views(story_id);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read non-expired stories"
  ON public.stories FOR SELECT
  USING (expires_at > now());

CREATE POLICY "Users can create own stories"
  ON public.stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
  ON public.stories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read story views"
  ON public.story_views FOR SELECT
  USING (true);

CREATE POLICY "Users can record own views"
  ON public.story_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

-- Phase 3: Spaces tables
CREATE TYPE public.space_status AS ENUM ('live', 'ended');
CREATE TYPE public.space_role AS ENUM ('host', 'speaker', 'listener');

CREATE TABLE public.spaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status space_status NOT NULL DEFAULT 'live',
  listener_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.space_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role space_role NOT NULL DEFAULT 'listener',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE (space_id, user_id)
);

CREATE INDEX idx_spaces_status ON public.spaces(status);
CREATE INDEX idx_spaces_host_id ON public.spaces(host_id);
CREATE INDEX idx_space_participants_space_id ON public.space_participants(space_id);

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read live spaces"
  ON public.spaces FOR SELECT
  USING (true);

CREATE POLICY "Users can create spaces"
  ON public.spaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update own spaces"
  ON public.spaces FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id);

CREATE POLICY "Anyone can read space participants"
  ON public.space_participants FOR SELECT
  USING (true);

CREATE POLICY "Users can join spaces"
  ON public.space_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation"
  ON public.space_participants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can leave spaces"
  ON public.space_participants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update listener count
CREATE OR REPLACE FUNCTION public.update_space_listener_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.spaces SET listener_count = (
      SELECT COUNT(*) FROM public.space_participants WHERE space_id = NEW.space_id AND left_at IS NULL
    ) WHERE id = NEW.space_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    UPDATE public.spaces SET listener_count = (
      SELECT COUNT(*) FROM public.space_participants WHERE space_id = COALESCE(NEW.space_id, OLD.space_id) AND left_at IS NULL
    ) WHERE id = COALESCE(NEW.space_id, OLD.space_id);
    RETURN COALESCE(NEW, OLD);
  END IF;
END;
$$;

CREATE TRIGGER on_space_participant_change
AFTER INSERT OR UPDATE OR DELETE ON public.space_participants
FOR EACH ROW
EXECUTE FUNCTION public.update_space_listener_count();

-- Enable realtime for spaces
ALTER PUBLICATION supabase_realtime ADD TABLE public.spaces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.space_participants;
