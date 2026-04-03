
-- Add status column to dm_conversations
ALTER TABLE public.dm_conversations 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Update existing conversations to active
UPDATE public.dm_conversations SET status = 'active' WHERE status = 'active';

-- Drop old insert policy that required mutual follows
DROP POLICY IF EXISTS "Users can create conversations with mutual follows" ON public.dm_conversations;
DROP POLICY IF EXISTS "Users can create dm conversations" ON public.dm_conversations;

-- New insert policy: any authenticated user can create a conversation
CREATE POLICY "Users can create dm conversations"
ON public.dm_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IN (user_a, user_b)
);

-- Drop and recreate select policy to include pending requests
DROP POLICY IF EXISTS "Users can view own conversations" ON public.dm_conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.dm_conversations;

CREATE POLICY "Users can view their conversations"
ON public.dm_conversations
FOR SELECT
TO authenticated
USING (auth.uid() IN (user_a, user_b));

-- Allow users to update conversation status (for accept/reject)
DROP POLICY IF EXISTS "Users can update conversation status" ON public.dm_conversations;

CREATE POLICY "Users can update conversation status"
ON public.dm_conversations
FOR UPDATE
TO authenticated
USING (auth.uid() IN (user_a, user_b))
WITH CHECK (auth.uid() IN (user_a, user_b));

-- Function to start a conversation (handles mutual vs non-mutual)
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
    -- If it was rejected, allow re-request
    IF _conv_status = 'rejected' THEN
      UPDATE dm_conversations 
      SET status = 'pending', last_message_at = now()
      WHERE id = _existing_id;
    END IF;
    RETURN _existing_id;
  END IF;

  -- Check mutual follow status
  _is_mutual := public.is_mutual_follow(_user_id, _other_user_id);

  -- Create conversation
  INSERT INTO dm_conversations (user_a, user_b, status)
  VALUES (_a, _b, CASE WHEN _is_mutual THEN 'active' ELSE 'pending' END)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- Function for recipient to accept a request
CREATE OR REPLACE FUNCTION public.accept_dm_request(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conv record;
  _user_id uuid;
  _sender_id uuid;
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

  -- Determine who the sender was (the one who sent the first message)
  SELECT sender_id INTO _sender_id
  FROM dm_messages
  WHERE conversation_id = _conversation_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- The recipient is the OTHER person (not the sender)
  IF _user_id = _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the recipient can accept');
  END IF;

  -- Must be a participant
  IF _user_id NOT IN (_conv.user_a, _conv.user_b) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;

  UPDATE dm_conversations SET status = 'active' WHERE id = _conversation_id;

  -- Notify the sender
  SELECT COALESCE(display_name, 'Someone') INTO _sender_name
  FROM profiles WHERE id = _sender_id;

  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    _sender_id,
    'Message Request Accepted ✉️',
    'Your message request was accepted! You can now chat freely.',
    'info'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function for recipient to reject a request
CREATE OR REPLACE FUNCTION public.reject_dm_request(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _conv record;
  _user_id uuid;
  _sender_id uuid;
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

  SELECT sender_id INTO _sender_id
  FROM dm_messages
  WHERE conversation_id = _conversation_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF _user_id = _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the recipient can reject');
  END IF;

  IF _user_id NOT IN (_conv.user_a, _conv.user_b) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a participant');
  END IF;

  UPDATE dm_conversations SET status = 'rejected' WHERE id = _conversation_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Update dm_messages insert: allow in active convos (unlimited) or pending convos (max 1 message)
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.dm_messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.dm_messages;

CREATE POLICY "Participants can send messages"
ON public.dm_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM dm_conversations c
    WHERE c.id = conversation_id
    AND auth.uid() IN (c.user_a, c.user_b)
    AND (
      c.status = 'active'
      OR (
        c.status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM dm_messages m
          WHERE m.conversation_id = conversation_id
          AND m.sender_id = auth.uid()
        )
      )
    )
  )
);
