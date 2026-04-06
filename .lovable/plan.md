

## AI Auto-Responder for Support Tickets

### What it does
When a user submits a new support ticket or sends a message, an AI assistant automatically replies in the chat. The AI asks clarifying questions, provides relevant information, and helps the user — but never takes any action (no balance changes, no market edits, no account modifications). Staff can still join the conversation at any time.

### How it works

**1. Create a new edge function `supabase/functions/support-ai-reply/index.ts`**
- Receives `ticket_id`, the latest user message content, the ticket category, and full conversation history
- Uses Lovable AI (`google/gemini-3-flash-preview`) with a carefully scoped system prompt:
  - "You are a support assistant for Opoll Market, a prediction market platform"
  - "Ask clarifying questions to understand the issue"
  - "Provide helpful guidance based on the category (withdrawal, deposit, KYC, etc.)"
  - "You CANNOT take any action — you cannot refund, credit, resolve, or modify anything"
  - "If the issue requires manual intervention, tell the user a staff member will review it shortly"
  - "Keep responses concise and friendly"
- Inserts the AI reply into `support_messages` with `is_staff = true` and a dedicated AI service role user ID
- Returns the response

**2. Create a service-role AI user for support messages**
- Database migration: insert a row into `profiles` with a fixed UUID for the AI bot (e.g., display_name: "AI Assistant", avatar_url: a bot icon)
- AI messages use this user ID so they appear distinctly from human staff

**3. Add `is_ai` column to `support_messages`**
- Migration: `ALTER TABLE public.support_messages ADD COLUMN is_ai boolean NOT NULL DEFAULT false;`
- AI replies are marked `is_ai = true` so the UI can style them differently

**4. Trigger AI reply from `SupportChat.tsx`**
- After a non-staff user sends a message, call the edge function
- Show a brief "AI is typing..." indicator while waiting
- The AI reply arrives via realtime subscription like any other message

**5. Update `SupportMessageBubble.tsx`**
- When `is_ai = true`, show a distinct bot avatar (sparkle/robot icon) and label "AI Assistant" instead of "Support Staff"
- Optionally add a subtle "Automated response" badge

**6. Update `SupportTab.tsx` (ticket creation)**
- After creating a ticket and the first message, immediately call the AI to send an initial response asking for more details

### AI prompt design (category-aware)
The system prompt includes category-specific guidance:
- **Withdrawal**: Ask for transaction ID, amount, date, payment method
- **Deposit**: Ask for payment method, reference number, amount
- **KYC**: Ask what stage they're stuck at, what error they see
- **Quick Trade / Prediction**: Ask for the market name, what happened, expected vs actual
- **Technical**: Ask for device, browser, steps to reproduce
- **General**: Ask for a clear description of the issue

### Database migration
```sql
ALTER TABLE public.support_messages ADD COLUMN is_ai boolean NOT NULL DEFAULT false;
```

### Files to create/modify
- `supabase/functions/support-ai-reply/index.ts` — new edge function
- `src/components/chat/SupportChat.tsx` — trigger AI after user message, typing indicator
- `src/components/chat/SupportMessageBubble.tsx` — bot avatar/label for AI messages
- `src/components/chat/SupportTab.tsx` — trigger AI after ticket creation
- Database migration for `is_ai` column

