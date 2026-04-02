

## Send Emoji to a Specific Participant in Spaces

### What it does
When any user taps on another participant's avatar during a live Space, an emoji picker appears. The sender picks an emoji, it floats from the tapped user's avatar, and the recipient gets a notification in the notification bell: "**[SenderName] sent you ❤️**".

### Current behavior
- Tapping avatars only works for moderators (host/co-host) — it opens an admin action sheet.
- Regular users cannot interact with avatars at all.
- Existing reactions broadcast to the whole room (not targeted).

### Changes

**File: `src/components/social/SpaceRoom.tsx`**

1. **New state**: Add `emojiTarget` state to track which participant was tapped for emoji sending (separate from the mod `actionTarget`).

2. **Avatar click logic change**: When a user taps an avatar (that isn't themselves):
   - If they have mod powers AND it's not the host → open the existing action sheet (unchanged).
   - If they don't have mod powers OR they tap their own avatar's neighbor → open a small emoji picker overlay for that participant.
   - Mod users also get a "Send Emoji" button added to the existing action sheet.

3. **Non-mod avatar tap**: For listeners/speakers without mod powers, tapping any other participant's avatar opens a compact emoji picker popover anchored near the avatar.

4. **`sendTargetedEmoji` function**: Sends a data-channel message with `{ type: "targeted_emoji", emoji, targetId, senderName }`. Also triggers the floating reaction from the target's avatar locally.

5. **Data channel handler**: When receiving a `targeted_emoji` message where `targetId === user.id`, insert a notification into the `notifications` table: title "Emoji Received", message "[SenderName] sent you [emoji]", type "info".

6. **Emoji picker UI**: A small bottom sheet or popover showing the existing `REACTIONS` array (🔥👏👍❤️😂💯🎯). Tapping one sends the targeted emoji and closes the picker.

### Implementation detail

- Avatar `onClick` for non-mod users: `setEmojiTarget(p)` (opens emoji picker).
- For mod users: keep existing behavior but add a "Send Emoji" row in the action sheet that switches to the emoji picker.
- Data channel message format: `{ type: "targeted_emoji", emoji: "❤️", targetId: "uuid", senderName: "John" }`.
- On receiving, if `targetId === user.id`, call `supabase.from("notifications").insert(...)` with `user_id = targetId`, `title = "Emoji Received"`, `message = "${senderName} sent you ${emoji}"`, `type = "info"`.
- The floating animation still appears from the target's avatar for all room participants (broadcast via data channel).
- Notification insert uses the service role via an edge function or direct insert if RLS allows (notifications table only allows service-role inserts, so we'll use the existing `send-push` pattern or insert via a lightweight edge function call).

Since the `notifications` table doesn't allow client INSERT, we'll add a small edge function `send-emoji-notification` or reuse the data channel + have the **sender** invoke `supabase.functions.invoke("send-push", { body: { user_id: targetId, title: "Emoji Received", body: "${senderName} sent you ${emoji}" } })` to also create a notification row. Alternatively, we can add an RLS policy allowing authenticated users to insert notifications for others — but that's less secure. Better approach: the sender calls `send-push` which already exists and handles push + we add a notification insert inside it.

### Revised approach for notification
- Modify `send-push/index.ts` to also insert a row into the `notifications` table when sending a push (it already has service role access).
- The sender calls `supabase.functions.invoke("send-push", { body: { user_id: targetId, title: "Emoji Received ✨", body: "${senderName} sent you ${emoji}" } })`.

### Files to modify
1. **`src/components/social/SpaceRoom.tsx`** — emoji target state, avatar click for all users, emoji picker UI, sendTargetedEmoji function, data channel handler
2. **`supabase/functions/send-push/index.ts`** — add notification row insert alongside push delivery

