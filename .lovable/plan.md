
Issue found
- The reaction tray logic in the chat UIs is using a hardcoded check (`rect.top < 100`) to decide whether to open above or below a message.
- That check does not account for the actual top of the scrollable message area, the chat header height, or safe-area padding, so the first message can still open upward and get clipped under the upper header.

Plan
1. Make the reaction flip logic use the real message-list boundary
- In `src/components/chat/ChatView.tsx`, use the existing `scrollRef` to expose the visible top of the message list.
- In `src/components/chat/SupportChat.tsx` and `src/components/chat/CommunityChat.tsx`, use the existing `scrollContainerRef` the same way.

2. Replace the hardcoded threshold in the bubbles
- Update `src/components/chat/ChatMessageBubble.tsx`
- Update `src/components/chat/SupportMessageBubble.tsx`
- Replace `rect.top < 100` with a boundary-aware check like:
  - “if the bubble is too close to the top of the message list, open reactions below instead of above”

3. Apply the same fix to the inline community reaction tray
- `src/components/chat/CommunityChat.tsx` has its own long-press reaction logic inline, so it needs the same boundary-aware rule for consistency.

4. Preserve current behavior elsewhere
- Messages with enough room above should still open the tray above.
- Only top-near messages should flip downward.

What this changes
- First messages in DM threads will no longer have their emoji tray hidden under the upper nav/header.
- The same long-press behavior becomes consistent across DM, support, and community chat screens.

Files involved
- `src/components/chat/ChatView.tsx`
- `src/components/chat/ChatMessageBubble.tsx`
- `src/components/chat/SupportChat.tsx`
- `src/components/chat/SupportMessageBubble.tsx`
- `src/components/chat/CommunityChat.tsx`

Validation
- Long-press the first message in a DM thread
- Long-press the first message in support chat
- Long-press the first message in community chat
- Check both sent and received messages, plus gift bubbles in DM
- Confirm the tray is fully visible on mobile and never sits under the upper header

Technical note
- This is mainly a positioning/clipping issue, not a z-index issue. The important fix is to measure against the actual scrollable chat area instead of the viewport with a fixed `100px` guess.
