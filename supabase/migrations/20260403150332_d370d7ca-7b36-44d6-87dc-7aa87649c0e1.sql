
DROP FUNCTION IF EXISTS public.send_dm_gift(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.send_dm_gift(
  p_conversation_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_emoji text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  IF v_sender_id = p_recipient_id THEN RAISE EXCEPTION 'Cannot gift yourself'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT COALESCE(gift_fee_percent, 2) INTO v_fee_percent
  FROM commission_settings LIMIT 1;

  v_fee := ROUND((p_amount * v_fee_percent / 100)::numeric, 4);
  v_net := p_amount - v_fee;

  IF NOT EXISTS (
    SELECT 1 FROM dm_conversations
    WHERE id = p_conversation_id
    AND (user_a = v_sender_id OR user_b = v_sender_id)
    AND (user_a = p_recipient_id OR user_b = p_recipient_id)
  ) THEN
    RAISE EXCEPTION 'Invalid conversation';
  END IF;

  SELECT gift_balance INTO v_sender_balance
  FROM balances WHERE user_id = v_sender_id FOR UPDATE;

  IF v_sender_balance IS NULL OR v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient gift balance';
  END IF;

  UPDATE balances SET gift_balance = gift_balance - p_amount, updated_at = now()
  WHERE user_id = v_sender_id;

  UPDATE balances SET rewards_balance = rewards_balance + v_net, updated_at = now()
  WHERE user_id = p_recipient_id;

  INSERT INTO dm_messages (conversation_id, sender_id, content, gift_amount)
  VALUES (p_conversation_id, v_sender_id, p_emoji, p_amount)
  RETURNING id INTO v_msg_id;

  UPDATE dm_conversations SET last_message_at = now() WHERE id = p_conversation_id;

  -- Get sender display name
  SELECT COALESCE(display_name, 'Someone') INTO v_sender_name
  FROM profiles WHERE id = v_sender_id;

  -- Record transaction for sender (gift sent)
  INSERT INTO transactions (user_id, type, amount, status)
  VALUES (v_sender_id, 'gift_sent', -p_amount, 'confirmed');

  -- Record transaction for recipient (gift received)
  INSERT INTO transactions (user_id, type, amount, status)
  VALUES (p_recipient_id, 'gift_received', v_net, 'confirmed');

  -- Send notification to recipient
  INSERT INTO notifications (user_id, title, message, type, actor_id)
  VALUES (
    p_recipient_id,
    'Gift Received ' || p_emoji,
    v_sender_name || ' sent you ' || p_emoji || ' ($' || p_amount::text || ') in DM!',
    'info',
    v_sender_id
  );

  RETURN v_msg_id;
END;
$$;
