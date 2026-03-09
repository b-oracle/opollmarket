
-- Add a nullable column to store the actor (e.g. follower) who triggered the notification
ALTER TABLE public.notifications ADD COLUMN actor_id uuid DEFAULT NULL;

-- Update the notify_new_follower function to store the follower_id in actor_id
CREATE OR REPLACE FUNCTION public.notify_new_follower()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _follower_name text;
BEGIN
  SELECT COALESCE(display_name, 'Someone') INTO _follower_name
  FROM public.profiles WHERE id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, title, message, type, actor_id)
  VALUES (
    NEW.following_id,
    'New Follower! 🎉',
    _follower_name || ' started following you.',
    'info',
    NEW.follower_id
  );
  RETURN NEW;
END;
$function$;
