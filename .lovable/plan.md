

## Add Reply-to-Message in DM Chat

### Overview
Add the ability to reply to specific messages in DM chat, mirroring the existing space chat reply pattern. Users swipe or long-press a message to reply, and the reply preview appears above the input bar.

### Database Migration
Add three columns to `dm_messages`:
```sql
ALTER TABLE public.dm_messages
ADD COLUMN reply_to_id uuid REFERENCES dm_messages(id) ON DELETE SET NULL,
ADD COLUMN reply_to_content text,
ADD COLUMN reply_to_sender_name text;
```
Denormalized content/name fields avoid extra joins (same pattern as space_messages).

### Changes

**1. `src/components/chat/ChatMessageBubble.tsx`**
- Add `onReply` callback prop
- Add a "Reply" button (↩ icon) to the reaction bar alongside Copy/Delete
- When tapped, calls `onReply({ id, content, senderName })`
- Render a reply preview banner above the bubble when `message.reply_to_id` exists — small quoted box showing sender name + truncated content, tappable to scroll to original

**2. `src/components/chat/ChatView.tsx`**
- Add `replyTo` state: `{ id, content, senderName } | null`
- Pass `onReply` handler to each `ChatMessageBubble`
- Above the input bar, show a reply context banner (sender name + preview text + X to cancel) when `replyTo` is set
- Include `reply_to_id`, `reply_to_content`, `reply_to_sender_name` in the insert payload when sending
- Clear `replyTo` after send
- Add `reply_to_id, reply_to_content, reply_to_sender_name` to the Message interface and query select
- Add scroll-to-message: assign refs/ids to message elements, scroll into view when reply preview is tapped

### Files Changed
| File | Change |
|------|--------|
| Migration SQL | Add `reply_to_id`, `reply_to_content`, `reply_to_sender_name` to `dm_messages` |
| `src/components/chat/ChatMessageBubble.tsx` | Add Reply button, `onReply` prop, render quoted reply preview |
| `src/components/chat/ChatView.tsx` | Add reply state, reply banner above input, include reply fields in insert, scroll-to-message |

