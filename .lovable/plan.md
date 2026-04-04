

## Reply-to-Message in Live Space Chat

### Overview
Add the ability for space chat participants to reply to specific messages, showing a quoted preview of the original message above the reply — similar to Twitter/WhatsApp reply threads.

### Database Change
**Migration: Add `reply_to_id` and `reply_to_content` columns to `space_messages`**

```sql
ALTER TABLE public.space_messages
  ADD COLUMN reply_to_id uuid REFERENCES public.space_messages(id) ON DELETE SET NULL,
  ADD COLUMN reply_to_content text,
  ADD COLUMN reply_to_name text;
```

We store denormalized `reply_to_content` and `reply_to_name` so we don't need a join or extra query to render the quoted message — keeps the chat fast.

### Code Changes

**1. Update `ChatMessage` interface (`SpaceRoom.tsx`)**
- Add `replyToId?: string`, `replyToContent?: string`, `replyToName?: string` fields

**2. Add reply state**
- New state: `replyTo: { id: string; name: string; text: string } | null`
- A "Reply" button appears on hover/tap alongside the existing reaction buttons
- When set, a small banner appears above the chat input showing "Replying to **Name**: message preview..." with a cancel (X) button

**3. Update `sendChat()` function**
- Include `reply_to_id`, `reply_to_content`, `reply_to_name` in both the data-channel broadcast and the DB insert when `replyTo` is set
- Clear `replyTo` after sending

**4. Update message loading and realtime handler**
- Map `reply_to_id`, `reply_to_content`, `reply_to_name` from DB rows and realtime payloads into the `ChatMessage` object

**5. Update message rendering**
- When a message has `replyToContent`, render a small quoted block above the message text:
  ```
  ┌──────────────────────┐
  │ ↩ Name               │  ← muted, smaller text
  │ Original message...  │  ← truncated to ~60 chars
  ├──────────────────────┤
  │ Reply text           │  ← normal message
  │                 9:42 │
  └──────────────────────┘
  ```
- Tapping the quoted block scrolls to the original message (if still in view)

### Files Changed
| File | Change |
|------|--------|
| Migration SQL | Add `reply_to_id`, `reply_to_content`, `reply_to_name` to `space_messages` |
| `src/components/social/SpaceRoom.tsx` | Add reply state, reply UI banner, update `sendChat`, update message rendering with quoted block, add Reply button alongside reactions |

