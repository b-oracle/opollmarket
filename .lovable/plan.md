

## Fix Messages Page Horizontal Scroll

### Problem
The Messages page (`ConversationList`) allows horizontal scrolling on mobile. The outer container doesn't clip horizontal overflow, so any content that extends beyond the viewport width causes a side-scroll.

### Solution
Two small CSS changes:

**`src/components/chat/ConversationList.tsx`**
- Add `overflow-x-hidden` to the root `div` (line 164) to prevent any horizontal scroll at the page level

**`src/components/chat/ChatView.tsx`**
- Add `overflow-x-hidden` to the root `div` (the `h-[100dvh]` container) for consistency — same fix applied to the individual chat thread view

These are single-property additions to existing elements. No layout restructuring needed — the viewport-locked flex pattern is already correct, this just clips any rogue horizontal overflow.

