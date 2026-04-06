-- 1. CRITICAL: Remove duplicate dm_messages INSERT policy that bypasses can_send_dm()
DROP POLICY IF EXISTS "Users can insert messages in own conversations" ON public.dm_messages;

-- 2. CRITICAL: Harden dm_calls INSERT to verify conversation membership
DROP POLICY IF EXISTS "Users can insert calls they initiate" ON public.dm_calls;
CREATE POLICY "Users can insert calls they initiate" ON public.dm_calls
FOR INSERT TO authenticated
WITH CHECK (
  caller_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM dm_conversations c
    WHERE c.id = dm_calls.conversation_id
    AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND (c.user_a = dm_calls.callee_id OR c.user_b = dm_calls.callee_id)
    AND c.status = 'active'
  )
);

-- 3. Harden dm_calls UPDATE to prevent field tampering (only status changes allowed)
DROP POLICY IF EXISTS "Users can update their own calls" ON public.dm_calls;
CREATE POLICY "Users can update their own calls" ON public.dm_calls
FOR UPDATE TO authenticated
USING (caller_id = auth.uid() OR callee_id = auth.uid())
WITH CHECK (
  (caller_id = auth.uid() OR callee_id = auth.uid())
  AND caller_id = (SELECT c.caller_id FROM dm_calls c WHERE c.id = dm_calls.id)
  AND callee_id = (SELECT c.callee_id FROM dm_calls c WHERE c.id = dm_calls.id)
  AND conversation_id = (SELECT c.conversation_id FROM dm_calls c WHERE c.id = dm_calls.id)
  AND room_name = (SELECT c.room_name FROM dm_calls c WHERE c.id = dm_calls.id)
);

-- 4. Remove duplicate dm_conversations UPDATE and SELECT policies
DROP POLICY IF EXISTS "Users can update conversation status" ON public.dm_conversations;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.dm_conversations;

-- 5. Harden dm_conversations UPDATE to prevent user_a/user_b tampering
DROP POLICY IF EXISTS "Users can update own conversations" ON public.dm_conversations;
CREATE POLICY "Users can update own conversations" ON public.dm_conversations
FOR UPDATE TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b)
WITH CHECK (
  (auth.uid() = user_a OR auth.uid() = user_b)
  AND user_a = (SELECT c.user_a FROM dm_conversations c WHERE c.id = dm_conversations.id)
  AND user_b = (SELECT c.user_b FROM dm_conversations c WHERE c.id = dm_conversations.id)
);