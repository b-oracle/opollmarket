
CREATE OR REPLACE FUNCTION public.notify_space_invitee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_name text;
  _space_title text;
BEGIN
  SELECT p.display_name INTO _host_name
  FROM profiles p WHERE p.id = NEW.inviter_id;

  SELECT s.title INTO _space_title
  FROM spaces s WHERE s.id = NEW.space_id;

  INSERT INTO notifications (user_id, title, message, type, actor_id)
  VALUES (
    NEW.invitee_id,
    'Space Invite 🎙️',
    COALESCE(_host_name, 'Someone') || ' invited you to join "' || COALESCE(_space_title, 'a Space') || '"',
    'info',
    NEW.inviter_id
  );

  RETURN NEW;
END;
$$;
