

## Fix Chat View Scroll Behavior

### Problem
The chat screen uses `min-h-screen` making it a tall document that scrolls as a whole page. The header is `sticky` not `fixed`, so scrolling moves everything — even when messages fit on screen. The page should lock in place and only the message area should scroll when there are enough messages to overflow.

### Solution
Convert ChatView from a document-flow layout to a fixed viewport layout.

**`src/components/chat/ChatView.tsx`**

1. Change the outer container from `min-h-screen bg-background flex flex-col` to `h-[100dvh] bg-background flex flex-col overflow-hidden` — this locks the entire view to the viewport height and prevents document-level scrolling.

2. Change the header from `sticky top-0` to just a static flex child (remove sticky positioning). It naturally stays at the top since the parent is a non-scrolling flex column.

3. Change the messages area from `flex-1 overflow-y-auto` with `paddingBottom: "80px"` to `flex-1 overflow-y-auto min-h-0` with a smaller bottom padding (the input bar will be a flex child, not fixed). The `min-h-0` is critical — without it, flex children won't shrink below their content size.

4. Change the input bar from `fixed bottom-0 left-0 right-0` to a static flex child at the bottom (remove fixed positioning). This eliminates the need for phantom bottom padding in the messages area.

### Result
- Header, messages, and input bar are three flex children inside a viewport-height container
- Only the messages area scrolls, and only when content overflows
- When messages fit on screen, scrolling does nothing — the view holds still

