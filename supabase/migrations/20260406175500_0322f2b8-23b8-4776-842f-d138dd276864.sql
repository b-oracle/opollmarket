
CREATE OR REPLACE FUNCTION public.mark_dm_messages_read(_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _updated integer;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user is a participant
  IF NOT EXISTS (
    SELECT 1 FROM dm_conversations
    WHERE id = _conversation_id
    AND (user_a = _user_id OR user_b = _user_id)
  ) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  -- Mark all unread messages from the OTHER user as read
  UPDATE dm_messages
  SET read_at = now()
  WHERE conversation_id = _conversation_id
    AND sender_id != _user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END;
$$;
