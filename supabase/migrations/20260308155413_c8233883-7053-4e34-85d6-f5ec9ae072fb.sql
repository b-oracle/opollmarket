
-- Follows table
CREATE TABLE public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read follows" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users can insert own follows" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can delete own follows" ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- Copy trading settings
CREATE TABLE public.copy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  copy_predictions boolean NOT NULL DEFAULT false,
  copy_quick_trades boolean NOT NULL DEFAULT false,
  auto_copy boolean NOT NULL DEFAULT false,
  max_amount numeric NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, target_user_id)
);

ALTER TABLE public.copy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own copy settings" ON public.copy_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own copy settings" ON public.copy_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own copy settings" ON public.copy_settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own copy settings" ON public.copy_settings FOR DELETE USING (auth.uid() = user_id);

-- Add profile_public flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT '';

-- Add a policy so anyone can read public profiles
CREATE POLICY "Anyone can read public profiles" ON public.profiles FOR SELECT USING (is_public = true);

-- Enable realtime for follows
ALTER PUBLICATION supabase_realtime ADD TABLE public.follows;

-- Create function to get follower/following counts
CREATE OR REPLACE FUNCTION public.get_follow_counts(_user_id uuid)
RETURNS TABLE(followers_count bigint, following_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM public.follows WHERE following_id = _user_id) AS followers_count,
    (SELECT COUNT(*) FROM public.follows WHERE follower_id = _user_id) AS following_count;
$$;

-- Trigger to notify a user when someone follows them
CREATE OR REPLACE FUNCTION public.notify_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _follower_name text;
BEGIN
  SELECT COALESCE(display_name, 'Someone') INTO _follower_name
  FROM public.profiles WHERE id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    NEW.following_id,
    'New Follower! 🎉',
    _follower_name || ' started following you.',
    'info'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_follower
AFTER INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.notify_new_follower();

-- Trigger to notify followers when a user places a bet (prediction)
CREATE OR REPLACE FUNCTION public.notify_followers_on_bet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_name text;
  _market_title text;
  _follower record;
BEGIN
  IF NEW.type NOT IN ('buy') OR NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, 'A trader') INTO _user_name
  FROM public.profiles WHERE id = NEW.user_id;

  SELECT title INTO _market_title
  FROM public.markets WHERE id = NEW.market_id;

  IF _market_title IS NULL THEN RETURN NEW; END IF;

  FOR _follower IN
    SELECT f.follower_id FROM public.follows f
    WHERE f.following_id = NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, market_id)
    VALUES (
      _follower.follower_id,
      _user_name || ' made a prediction 📊',
      _user_name || ' predicted on "' || _market_title || '"',
      'info',
      NEW.market_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_followers_on_bet
AFTER INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_followers_on_bet();
