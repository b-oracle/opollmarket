
-- 1. FIX: community_messages UPDATE policy allows editing ANY field on ANY row
-- Replace with a policy that only allows updating the reactions column
DROP POLICY IF EXISTS "Authenticated users can update reactions" ON public.community_messages;

CREATE POLICY "Authenticated users can update reactions only"
  ON public.community_messages
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    -- Ensure only the reactions field changes; all other fields must remain the same
    user_id = (SELECT cm.user_id FROM public.community_messages cm WHERE cm.id = community_messages.id)
    AND content = (SELECT cm.content FROM public.community_messages cm WHERE cm.id = community_messages.id)
    AND community_slug = (SELECT cm.community_slug FROM public.community_messages cm WHERE cm.id = community_messages.id)
    AND image_url IS NOT DISTINCT FROM (SELECT cm.image_url FROM public.community_messages cm WHERE cm.id = community_messages.id)
    AND reply_to_id IS NOT DISTINCT FROM (SELECT cm.reply_to_id FROM public.community_messages cm WHERE cm.id = community_messages.id)
    AND reply_to_content IS NOT DISTINCT FROM (SELECT cm.reply_to_content FROM public.community_messages cm WHERE cm.id = community_messages.id)
    AND reply_to_name IS NOT DISTINCT FROM (SELECT cm.reply_to_name FROM public.community_messages cm WHERE cm.id = community_messages.id)
  );

-- 2. FIX: send_dm_money doesn't handle missing recipient balance row
-- Recreate with IF NOT FOUND fallback (matches send_space_gift pattern)
CREATE OR REPLACE FUNCTION public.send_dm_money(
  p_conversation_id uuid,
  p_recipient_id uuid,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sender_id uuid;
  v_sender_balance numeric;
  v_msg_id uuid;
  v_fee_percent numeric;
  v_fee numeric;
  v_net numeric;
  v_sender_name text;
  v_rows_affected integer;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_sender_id = p_recipient_id THEN RAISE EXCEPTION 'Cannot send money to yourself'; END IF;
  IF p_amount < 0.50 THEN RAISE EXCEPTION 'Minimum amount is $0.50'; END IF;

  -- Get fee percent (reuses gift_fee_percent)
  SELECT COALESCE(gift_fee_percent, 2) INTO v_fee_percent
  FROM commission_settings LIMIT 1;

  v_fee := ROUND((p_amount * v_fee_percent / 100)::numeric, 4);
  v_net := p_amount - v_fee;

  -- Validate conversation membership
  IF NOT EXISTS (
    SELECT 1 FROM dm_conversations
    WHERE id = p_conversation_id
    AND (user_a = v_sender_id OR user_b = v_sender_id)
    AND (user_a = p_recipient_id OR user_b = p_recipient_id)
  ) THEN
    RAISE EXCEPTION 'Invalid conversation';
  END IF;

  -- Lock and check sender main balance
  SELECT amount INTO v_sender_balance
  FROM balances WHERE user_id = v_sender_id FOR UPDATE;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct from sender main balance
  UPDATE balances SET amount = amount - p_amount, updated_at = now()
  WHERE user_id = v_sender_id;

  -- Credit recipient main balance (net after fee)
  UPDATE balances SET amount = amount + v_net, updated_at = now()
  WHERE user_id = p_recipient_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  -- If recipient has no balance row, create one
  IF v_rows_affected = 0 THEN
    INSERT INTO balances (user_id, amount, currency)
    VALUES (p_recipient_id, v_net, 'USDT');
  END IF;

  -- Insert DM message with money emoji and amount
  INSERT INTO dm_messages (conversation_id, sender_id, content, gift_amount)
  VALUES (p_conversation_id, v_sender_id, '💵', p_amount)
  RETURNING id INTO v_msg_id;

  UPDATE dm_conversations SET last_message_at = now() WHERE id = p_conversation_id;

  -- Get sender display name
  SELECT COALESCE(display_name, 'Someone') INTO v_sender_name
  FROM profiles WHERE id = v_sender_id;

  -- Record transactions
  INSERT INTO transactions (user_id, type, amount, status, description)
  VALUES (v_sender_id, 'gift_sent', -p_amount, 'confirmed', 'Direct transfer to ' || (SELECT COALESCE(display_name, 'user') FROM profiles WHERE id = p_recipient_id));

  INSERT INTO transactions (user_id, type, amount, status, description)
  VALUES (p_recipient_id, 'gift_received', v_net, 'confirmed', 'Direct transfer from ' || v_sender_name);

  -- Notify recipient
  INSERT INTO notifications (user_id, title, message, type, actor_id)
  VALUES (
    p_recipient_id,
    'Money Received 💵',
    v_sender_name || ' sent you $' || p_amount::text || ' directly in DM!',
    'info',
    v_sender_id
  );

  RETURN v_msg_id;
END;
$$;

-- 3. FIX: dm_messages reaction UPDATE policy - tighten the WITH CHECK 
-- The existing policy has self-referential checks (content = content is always true)
-- Replace with proper immutability checks
DROP POLICY IF EXISTS "Users can update reactions on conversation messages" ON public.dm_messages;

CREATE POLICY "Users can update reactions on conversation messages"
  ON public.dm_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = dm_messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = dm_messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    AND content = (SELECT m.content FROM dm_messages m WHERE m.id = dm_messages.id)
    AND sender_id = (SELECT m.sender_id FROM dm_messages m WHERE m.id = dm_messages.id)
    AND conversation_id = (SELECT m.conversation_id FROM dm_messages m WHERE m.id = dm_messages.id)
    AND gift_amount IS NOT DISTINCT FROM (SELECT m.gift_amount FROM dm_messages m WHERE m.id = dm_messages.id)
  );
