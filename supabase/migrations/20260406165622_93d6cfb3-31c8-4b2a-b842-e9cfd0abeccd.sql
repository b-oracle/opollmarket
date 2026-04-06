
-- Create toggle_message_reaction RPC
CREATE OR REPLACE FUNCTION public.toggle_message_reaction(
  _table text,
  _message_id uuid,
  _emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current jsonb;
  _users jsonb;
  _updated jsonb;
  _user_list text[];
  _idx int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate table name
  IF _table NOT IN ('dm_messages', 'community_messages', 'support_messages', 'space_messages') THEN
    RAISE EXCEPTION 'Invalid table';
  END IF;

  -- Membership validation per table
  IF _table = 'dm_messages' THEN
    IF NOT EXISTS (
      SELECT 1 FROM dm_conversations dc
      JOIN dm_messages dm ON dm.conversation_id = dc.id
      WHERE dm.id = _message_id
        AND (dc.user_a = _uid OR dc.user_b = _uid)
    ) THEN
      RAISE EXCEPTION 'Not a participant';
    END IF;

  ELSIF _table = 'community_messages' THEN
    IF NOT EXISTS (
      SELECT 1 FROM community_memberships cm
      JOIN community_messages cmsg ON cmsg.community_slug = cm.community_slug
      WHERE cmsg.id = _message_id AND cm.user_id = _uid
    ) THEN
      RAISE EXCEPTION 'Not a member';
    END IF;

  ELSIF _table = 'support_messages' THEN
    IF NOT EXISTS (
      SELECT 1 FROM support_tickets st
      JOIN support_messages sm ON sm.ticket_id = st.id
      WHERE sm.id = _message_id
        AND (st.user_id = _uid OR public.has_role(_uid, 'admin') OR public.has_role(_uid, 'super_admin') OR public.has_role(_uid, 'support'))
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

  ELSIF _table = 'space_messages' THEN
    IF NOT EXISTS (
      SELECT 1 FROM space_messages smsg
      WHERE smsg.id = _message_id
        AND public.is_space_participant(smsg.space_id, _uid)
    ) THEN
      RAISE EXCEPTION 'Not a participant';
    END IF;
  END IF;

  -- Fetch current reactions
  IF _table = 'dm_messages' THEN
    SELECT COALESCE(reactions, '{}'::jsonb) INTO _current FROM dm_messages WHERE id = _message_id FOR UPDATE;
  ELSIF _table = 'community_messages' THEN
    SELECT COALESCE(reactions, '{}'::jsonb) INTO _current FROM community_messages WHERE id = _message_id FOR UPDATE;
  ELSIF _table = 'support_messages' THEN
    SELECT COALESCE(reactions, '{}'::jsonb) INTO _current FROM support_messages WHERE id = _message_id FOR UPDATE;
  ELSIF _table = 'space_messages' THEN
    SELECT COALESCE(reactions, '{}'::jsonb) INTO _current FROM space_messages WHERE id = _message_id FOR UPDATE;
  END IF;

  IF _current IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  -- Toggle user in the emoji array
  _users := COALESCE(_current->_emoji, '[]'::jsonb);
  
  -- Check if user already reacted
  SELECT array_agg(u) INTO _user_list
  FROM jsonb_array_elements_text(_users) AS u;

  IF _user_list IS NOT NULL AND _uid::text = ANY(_user_list) THEN
    -- Remove user
    _users := (
      SELECT COALESCE(jsonb_agg(u), '[]'::jsonb)
      FROM jsonb_array_elements_text(_users) AS u
      WHERE u != _uid::text
    );
  ELSE
    -- Add user
    _users := _users || to_jsonb(_uid::text);
  END IF;

  -- Update the reactions object
  IF jsonb_array_length(_users) = 0 THEN
    _updated := _current - _emoji;
  ELSE
    _updated := jsonb_set(_current, ARRAY[_emoji], _users);
  END IF;

  -- Persist
  IF _table = 'dm_messages' THEN
    UPDATE dm_messages SET reactions = _updated WHERE id = _message_id;
  ELSIF _table = 'community_messages' THEN
    UPDATE community_messages SET reactions = _updated WHERE id = _message_id;
  ELSIF _table = 'support_messages' THEN
    UPDATE support_messages SET reactions = _updated WHERE id = _message_id;
  ELSIF _table = 'space_messages' THEN
    UPDATE space_messages SET reactions = _updated WHERE id = _message_id;
  END IF;

  RETURN _updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_message_reaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction TO authenticated;

-- Add DELETE policy for dm_messages (sender-only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dm_messages' AND policyname = 'Users can delete own DM messages'
  ) THEN
    CREATE POLICY "Users can delete own DM messages"
    ON public.dm_messages
    FOR DELETE
    TO authenticated
    USING (auth.uid() = sender_id);
  END IF;
END $$;
