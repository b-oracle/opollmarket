
-- 1) Helper: check mutual follow
CREATE OR REPLACE FUNCTION public.is_mutual_follow(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM follows WHERE follower_id = user_a AND following_id = user_b
  ) AND EXISTS (
    SELECT 1 FROM follows WHERE follower_id = user_b AND following_id = user_a
  );
$$;

-- 2) dm_conversations
CREATE TABLE public.dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_conversations_user_pair_unique UNIQUE (user_a, user_b),
  CONSTRAINT dm_conversations_ordered CHECK (user_a < user_b)
);

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conversations"
  ON public.dm_conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Users can insert own conversations"
  ON public.dm_conversations FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_a OR auth.uid() = user_b)
    AND is_mutual_follow(user_a, user_b)
  );

CREATE POLICY "Users can update own conversations"
  ON public.dm_conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- 3) dm_messages
CREATE TABLE public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  gift_amount numeric DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz DEFAULT NULL
);

CREATE INDEX idx_dm_messages_conversation ON public.dm_messages(conversation_id, created_at DESC);
CREATE INDEX idx_dm_messages_unread ON public.dm_messages(sender_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read messages in own conversations"
  ON public.dm_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

CREATE POLICY "Users can insert messages in own conversations"
  ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    AND char_length(content) <= 2000
  );

CREATE POLICY "Users can update read_at on received messages"
  ON public.dm_messages FOR UPDATE TO authenticated
  USING (
    sender_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  )
  WITH CHECK (
    sender_id != auth.uid()
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;

-- 4) send_dm_gift RPC
CREATE OR REPLACE FUNCTION public.send_dm_gift(
  p_conversation_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_emoji text DEFAULT '🎁'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
  v_sender_balance numeric;
  v_msg_id uuid;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_sender_id = p_recipient_id THEN RAISE EXCEPTION 'Cannot gift yourself'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  -- Verify conversation membership
  IF NOT EXISTS (
    SELECT 1 FROM dm_conversations
    WHERE id = p_conversation_id
    AND (user_a = v_sender_id OR user_b = v_sender_id)
    AND (user_a = p_recipient_id OR user_b = p_recipient_id)
  ) THEN
    RAISE EXCEPTION 'Invalid conversation';
  END IF;

  -- Lock and check sender gift_balance
  SELECT gift_balance INTO v_sender_balance
  FROM balances WHERE user_id = v_sender_id FOR UPDATE;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient gift balance';
  END IF;

  -- Deduct from sender
  UPDATE balances SET gift_balance = gift_balance - p_amount, updated_at = now()
  WHERE user_id = v_sender_id;

  -- Credit recipient rewards_balance
  UPDATE balances SET rewards_balance = rewards_balance + p_amount, updated_at = now()
  WHERE user_id = p_recipient_id;

  -- Insert gift message
  INSERT INTO dm_messages (conversation_id, sender_id, content, gift_amount)
  VALUES (p_conversation_id, v_sender_id, p_emoji, p_amount)
  RETURNING id INTO v_msg_id;

  -- Update last_message_at
  UPDATE dm_conversations SET last_message_at = now() WHERE id = p_conversation_id;

  RETURN v_msg_id;
END;
$$;

-- 5) Feature toggle
INSERT INTO public.feature_toggles (feature_key, label, enabled)
VALUES ('dm_chat', 'Direct Messages', true)
ON CONFLICT DO NOTHING;
