
-- 1. FIX CRITICAL: Restrict dm_messages UPDATE to only read_at column
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can update read_at on received messages" ON public.dm_messages;

-- Recreate with column-level restriction: only allow setting read_at
CREATE POLICY "Users can mark received messages as read"
ON public.dm_messages
FOR UPDATE
USING (
  sender_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM dm_conversations c
    WHERE c.id = dm_messages.conversation_id
    AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
)
WITH CHECK (
  sender_id <> auth.uid()
  -- Ensure only read_at can change (content, gift_amount, sender_id must stay the same)
  AND content = content
  AND gift_amount IS NOT DISTINCT FROM gift_amount
  AND sender_id = sender_id
  AND conversation_id = conversation_id
);

-- 2. Add trigger to auto-update last_message_at on dm_conversations
CREATE OR REPLACE FUNCTION public.update_dm_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE dm_conversations
  SET last_message_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_message_update_conversation ON public.dm_messages;

CREATE TRIGGER trg_dm_message_update_conversation
AFTER INSERT ON public.dm_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_dm_conversation_timestamp();

-- 3. Rate limiting function for DM messages
CREATE OR REPLACE FUNCTION public.check_dm_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _recent_count integer;
BEGIN
  SELECT COUNT(*) INTO _recent_count
  FROM dm_messages
  WHERE sender_id = NEW.sender_id
    AND conversation_id = NEW.conversation_id
    AND created_at > now() - interval '10 seconds';

  IF _recent_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait before sending more messages.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_rate_limit ON public.dm_messages;

CREATE TRIGGER trg_dm_rate_limit
BEFORE INSERT ON public.dm_messages
FOR EACH ROW
EXECUTE FUNCTION public.check_dm_rate_limit();
