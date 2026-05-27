
-- 1. balance_ledger: users can view their own rows
CREATE POLICY "Users can view own ledger"
ON public.balance_ledger
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2. user_security_settings: allow owner INSERT
CREATE POLICY "Users can insert own security settings"
ON public.user_security_settings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3. realtime.messages — restrict broadcast/presence subscriptions to topics owned by caller.
-- service_role bypasses RLS so server-side fan-out (postgres_changes) still works.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read own scoped topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can write own scoped topics" ON realtime.messages;

CREATE POLICY "Authenticated can read own scoped topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
  OR realtime.topic() LIKE ('private:' || auth.uid()::text || ':%')
  OR realtime.topic() LIKE 'public:%'
);

CREATE POLICY "Authenticated can write own scoped topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
  OR realtime.topic() LIKE ('private:' || auth.uid()::text || ':%')
);
