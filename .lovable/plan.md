

## Secure Direct Messaging for Mutual Follows

### Overview
Add a real-time DM system where mutual follows can chat directly and send gifts within the conversation. A chat icon sits in the TopBar next to the notification bell, with an unread badge.

### UX Flow
```text
TopBar:  [Logo]  ...  [💬 unread badge]  [🔔]  [👤]

💬 tap → Full-screen Messages drawer/page
  ├── Conversation list (mutual follows with existing threads)
  ├── Each row: avatar, name, last message preview, timestamp, unread dot
  └── Tap conversation → Chat view
        ├── Message bubbles (sender/receiver aligned left/right)
        ├── Text input + send button
        ├── 🎁 Gift button → gift modal (amount picker, uses existing gift_balance system)
        └── Gift messages render as special styled cards in chat
```

### Database (3 new tables + 1 migration)

**`dm_conversations`** — one row per unique pair of mutual-follow users
- `id` uuid PK
- `user_a` uuid NOT NULL (lower UUID always stored as user_a for dedup)
- `user_b` uuid NOT NULL
- `last_message_at` timestamptz
- `created_at` timestamptz DEFAULT now()
- UNIQUE(user_a, user_b)
- RLS: SELECT/INSERT/UPDATE only where auth.uid() = user_a OR auth.uid() = user_b

**`dm_messages`** — individual messages
- `id` uuid PK
- `conversation_id` uuid FK → dm_conversations
- `sender_id` uuid NOT NULL
- `content` text (max 2000 chars)
- `gift_amount` numeric DEFAULT NULL (non-null = gift message)
- `created_at` timestamptz DEFAULT now()
- `read_at` timestamptz DEFAULT NULL
- RLS: SELECT/INSERT only where user is participant of the conversation

**`dm_messages` Realtime** — enable via `ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;`

### RLS Design
- Conversations: users can only see/create conversations they are part of
- Messages: users can only read messages in their conversations, insert messages where sender_id = auth.uid()
- Mutual follow check enforced at INSERT time via a SECURITY DEFINER function `is_mutual_follow(a, b)` that verifies both directions exist in `follows`

### Gift Integration
- Reuse the existing `send_space_gift` pattern: create a new `send_dm_gift` RPC
- Deducts from sender's `gift_balance`, credits recipient's `rewards_balance`
- Inserts a `dm_messages` row with `gift_amount` set (renders as a gift card in UI)
- Self-gifting blocked in RPC

### Frontend Components (4 new files)

1. **`src/components/chat/ChatIcon.tsx`** — TopBar icon with unread count badge. Queries `dm_messages` where `read_at IS NULL AND sender_id != auth.uid()`.

2. **`src/components/chat/ConversationList.tsx`** — Full-page drawer listing all conversations. Shows avatar, name, last message preview, unread indicator. "New Chat" button opens mutual-follows picker.

3. **`src/components/chat/ChatView.tsx`** — Message thread for a single conversation. Real-time subscription on `dm_messages` filtered by `conversation_id`. Text input, send button, gift button. Auto-marks messages as read on open.

4. **`src/components/chat/ChatGiftModal.tsx`** — Amount picker reusing gift_balance top-up flow. Calls `send_dm_gift` RPC, inserts gift message.

### TopBar Change
- Add `ChatIcon` between the logo area and `NotificationBell` in `src/components/TopBar.tsx`

### Routing
- `/messages` — ConversationList page
- `/messages/:conversationId` — ChatView page
- Add routes in `App.tsx`

### Security Considerations
- All message content validated server-side (max length, no empty)
- RLS ensures users only access their own conversations
- Mutual follow check prevents unsolicited messages
- Gift RPC uses `FOR UPDATE` locking pattern consistent with existing financial RPCs
- No true E2E encryption (would require client-side key exchange infrastructure), but data is encrypted at rest in the database and in transit via TLS

### Feature Toggle
- Add `dm_chat` row to `feature_toggles` table so admins can enable/disable the feature

