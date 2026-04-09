
-- Add initiated_by column
ALTER TABLE public.dm_conversations ADD COLUMN IF NOT EXISTS initiated_by uuid;

-- Update start_dm_conversation to set initiated_by
CREATE OR REPLACE FUNCTION public.start_dm_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _a uuid;
  _b uuid;
  _existing_id uuid;
  _new_id uuid;
  _is_mutual boolean;
  _conv_status text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _user_id = _other_user_id THEN RAISE EXCEPTION 'Cannot message yourself'; END IF;

  -- Determine canonical order
  IF _user_id < _other_user_id THEN
    _a := _user_id; _b := _other_user_id;
  ELSE
    _a := _other_user_id; _b := _user_id;
  END IF;

  -- Check if conversation already exists
  SELECT id, status INTO _existing_id, _conv_status
  FROM dm_conversations
  WHERE user_a = _a AND user_b = _b;

  IF _existing_id IS NOT NULL THEN
    -- If it was rejected, allow re-request and update initiator
    IF _conv_status = 'rejected' THEN
      UPDATE dm_conversations 
      SET status = 'pending', last_message_at = now(), initiated_by = _user_id
      WHERE id = _existing_id;
    END IF;
    RETURN _existing_id;
  END IF;

  -- Check mutual follow status
  _is_mutual := public.is_mutual_follow(_user_id, _other_user_id);

  -- Create conversation with initiator tracked
  INSERT INTO dm_conversations (user_a, user_b, status, initiated_by)
  VALUES (_a, _b, CASE WHEN _is_mutual THEN 'active' ELSE 'pending' END, _user_id)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- Update accept_dm_request to use initiated_by
CREATE OR REPLACE FUNCTION public.accept_dm_request(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conv record;
  _user_id uuid;
  _initiator_id uuid;
  _sender_name text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _conv FROM dm_conversations WHERE id = _conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversation not found');
  END IF;

  IF _conv.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a pending request');
  END IF;

  -- Determine who initiated: use initiated_by if set, else fall back to first message
  _initiator_id := _conv.initiated_by;
  IF _initiator_id IS NULL THEN
    SELECT sender_id INTO _initiator_id
    FROM dm_messages
    WHERE conversation_id = _conversation_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- The recipient (acceptor) must NOT be the initiator
  IF _user_id = _initiator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the recipient can accept');
  END IF;

  -- Must be a participant
  IF _user_id NOT IN (_conv.user_a, _conv.user_b) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;

  UPDATE dm_conversations SET status = 'active' WHERE id = _conversation_id;

  -- Notify the initiator
  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    _initiator_id,
    'Message Request Accepted ✉️',
    'Your message request was accepted! You can now chat freely.',
    'info'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Update reject_dm_request to use initiated_by
CREATE OR REPLACE FUNCTION public.reject_dm_request(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conv record;
  _user_id uuid;
  _initiator_id uuid;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _conv FROM dm_conversations WHERE id = _conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversation not found');
  END IF;

  IF _conv.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a pending request');
  END IF;

  _initiator_id := _conv.initiated_by;
  IF _initiator_id IS NULL THEN
    SELECT sender_id INTO _initiator_id
    FROM dm_messages
    WHERE conversation_id = _conversation_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Only the recipient can reject
  IF _user_id = _initiator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the recipient can reject');
  END IF;

  IF _user_id NOT IN (_conv.user_a, _conv.user_b) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;

  UPDATE dm_conversations SET status = 'rejected' WHERE id = _conversation_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
