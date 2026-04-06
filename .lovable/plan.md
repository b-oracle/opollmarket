

## Plan: Fix Emoji Reactions Across All Chat Types

### Problem
Emoji reactions fail silently on DM, support, community, and space messages. The root cause is the self-referencing subqueries in the UPDATE RLS `WITH CHECK` clauses — these subqueries read from the same table under RLS, creating evaluation conflicts during UPDATE operations.

### Solution
Replace direct `.update()` calls with a single **SECURITY DEFINER** RPC function that handles reaction toggling for all four message types. This bypasses RLS safely while enforcing membership checks server-side.

### Changes

**1. Database Migration — Create `toggle_message_reaction` RPC**

A `SECURITY DEFINER` function that:
- Accepts `_table` (enum: `dm_messages`, `community_messages`, `support_messages`, `space_messages`), `_message_id`, `_emoji`
- Validates the caller's membership (conversation participant, ticket owner/staff, community member, space participant)
- Toggles the user's ID in the `reactions` JSONB field atomically
- Returns the updated reactions object

This completely avoids the self-referencing RLS subquery problem.

**2. Frontend Updates (4 files)**

- `src/components/chat/ChatMessageBubble.tsx` — Replace `.from("dm_messages").update({reactions})` with `.rpc("toggle_message_reaction", {_table: "dm_messages", _message_id, _emoji})`
- `src/components/chat/SupportMessageBubble.tsx` — Same pattern for `support_messages`
- `src/components/chat/CommunityChat.tsx` — Same pattern for `community_messages`
- `src/components/social/SpaceRoom.tsx` — Same pattern for `space_messages`

**3. Add `dm_messages` DELETE policy (bonus fix)**

The delete button in DMs silently fails because there is no DELETE policy. Add one for sender-only deletion.

### Technical Details

The RPC uses dynamic column reads with `EXECUTE` to fetch and update the reactions JSONB column on the correct table, while the membership validation uses static queries for each table type. The function runs as `SECURITY DEFINER` with `search_path = public`, matching the existing pattern used by `is_space_participant` and `send_dm_gift`.

