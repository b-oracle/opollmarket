## Goal
Let users edit or delete their own messages in community chats (matching the DM bubble pattern), so mistakes can be fixed.

## Scope
File: `src/components/chat/CommunityChat.tsx` (only)
DB: `community_messages` already has `content` column; needs `edited_at` column + RLS policies for UPDATE/DELETE by owner.

## Changes

### 1. Database migration
- Add `edited_at TIMESTAMPTZ` column to `community_messages` (nullable).
- Add RLS policies:
  - `UPDATE`: only `auth.uid() = user_id`, restricted to `content`/`edited_at` fields (enforced via trigger or a column check on policy).
  - `DELETE`: only `auth.uid() = user_id`.
- A `BEFORE UPDATE` trigger sets `edited_at = now()` and prevents changing fields other than `content`.

### 2. Long-press action bar (CommunityChat.tsx)
On the existing reaction popover, when the message belongs to the current user (`m.user_id === user.id`), show two extra icon buttons next to Reply/Copy:
- **Edit** (pencil icon) — opens inline editor
- **Delete** (trash icon) — confirms then deletes

### 3. Inline edit UI
- Track `editingId` + `editingText` state.
- When editing, render an `<Input>` (or small textarea) in place of the message paragraph with Save / Cancel buttons.
- Save runs `supabase.from("community_messages").update({ content: trimmed }).eq("id", id)`; trigger sets `edited_at`.
- Empty save = no-op; show toast on error.

### 4. Delete UI
- Confirm via existing `AlertDialog` pattern (or `confirm()` for parity with DM cancel flow).
- `supabase.from("community_messages").delete().eq("id", id)`.
- Realtime channel already invalidates the query, so the message disappears for everyone.

### 5. "Edited" indicator
- When `m.edited_at` is set, render `(edited)` next to the timestamp in muted text.

## Technical notes
- TypeScript types for `CommunityMessage` get an optional `edited_at: string | null`.
- All ownership checks are double-enforced: UI hides edit/delete for non-owners, RLS rejects others server-side.
- No edits to existing reaction/reply logic.
