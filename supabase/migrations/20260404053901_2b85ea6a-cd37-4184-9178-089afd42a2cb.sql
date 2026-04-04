-- Drop the still-recursive policy
DROP POLICY IF EXISTS "Participants can send messages" ON public.dm_messages;

-- Create a helper function to check if user can send in conversation
CREATE OR REPLACE FUNCTION public.can_send_dm(_conversation_id uuid, _sender_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dm_conversations c
    WHERE c.id = _conversation_id
      AND (_sender_id = c.user_a OR _sender_id = c.user_b)
      AND (
        c.status = 'active'
        OR (
          c.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM dm_messages m
            WHERE m.conversation_id = _conversation_id
              AND m.sender_id = _sender_id
          )
        )
      )
  );
$$;

-- Recreate the policy using the helper function
CREATE POLICY "Participants can send messages" ON public.dm_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.can_send_dm(conversation_id, auth.uid())
);