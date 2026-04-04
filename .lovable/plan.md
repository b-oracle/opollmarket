

## Fix: Chat Reactions Not Persisting on Other Users' Messages

### Problem
When you leave a live space and return, reactions (emojis) you or others placed on **other people's** messages are gone — only reactions on **your own** messages survive. This is because reactions are never actually saved to the database for other people's messages.

### Root Cause
The `space_messages` UPDATE RLS policy checks if the current user is an active participant by querying `space_participants`. But `space_participants` itself has RLS policies that query back into `space_participants` (the recursion issue we partially fixed earlier). This causes the UPDATE to **silently fail** when reacting to someone else's message.

The policy has an `OR user_id = auth.uid()` escape clause — so updating reactions on **your own** messages always works. That's why your own message reactions persist but others don't.

### Fix

**1. Migration: Use the recursion-safe helper function in the UPDATE policy**

Replace the current `space_messages` UPDATE policy so it uses `public.is_space_participant()` (the `SECURITY DEFINER` function we already created) instead of directly querying `space_participants`:

```sql
DROP POLICY IF EXISTS "Users can update message reactions in their spaces"
  ON public.space_messages;

CREATE POLICY "Users can update message reactions in their spaces"
ON public.space_messages FOR UPDATE TO authenticated
USING (
  public.is_space_participant(space_id, auth.uid())
  OR user_id = auth.uid()
)
WITH CHECK (
  public.is_space_participant(space_id, auth.uid())
  OR user_id = auth.uid()
);
```

This is a one-line policy swap — the `is_space_participant` function bypasses RLS (it's `SECURITY DEFINER`), breaking the recursive loop.

### Files Changed
| File | Change |
|------|--------|
| New migration SQL | Replace UPDATE policy on `space_messages` to use `is_space_participant()` |

No frontend code changes needed — the `reactToMessage` function already persists to DB correctly; it's only the RLS policy blocking the write.

