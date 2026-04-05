

## Add Delivered/Seen/Read Status Indicators to DM Messages

### Overview
Add WhatsApp-style message status indicators (single check = Sent, double check = Delivered, blue double check = Read) below the sender's own messages.

### How It Works
- **Sent** (✓): Message exists in database (already the case when inserted)
- **Delivered**: Not practical without push notification delivery confirmation — we'll skip this and use Sent → Read (two states), which is the realistic model for a web app
- **Read** (✓✓ blue): The `read_at` field already exists on `dm_messages` and is already being set when the recipient views messages in `ChatView.tsx`

No database changes needed — `read_at` already exists and is already populated.

### Changes

**File: `src/components/chat/ChatMessageBubble.tsx`**

1. Add `Check` and `CheckCheck` icons from lucide-react
2. For `isMine` messages only, render a status indicator next to the timestamp:
   - If `read_at` is not null → blue double-check icon (✓✓) with "Read" semantics
   - If `read_at` is null → single grey check (✓) meaning "Sent"
3. The indicator appears inline after the time text, keeping the layout compact

### Visual

```text
┌──────────────────────────┐
│ Hey, what's up?          │
│         2 min ago  ✓✓    │  ← blue double check = read
└──────────────────────────┘

┌──────────────────────────┐
│ Just sent this           │
│         just now   ✓     │  ← grey single check = sent
└──────────────────────────┘
```

### Files Changed
| File | Change |
|------|--------|
| `src/components/chat/ChatMessageBubble.tsx` | Add read/sent status icons on sender's messages next to timestamp |

