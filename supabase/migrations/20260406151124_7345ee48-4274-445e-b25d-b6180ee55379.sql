
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
