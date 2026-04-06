

## Fix: Support Chat Messages Blocking Touch Scroll

### Problem
The message bubble in `SupportMessageBubble.tsx` has `touch-none` CSS class applied, which tells the browser to ignore all touch gestures (including scrolling) on that element. Since messages fill most of the chat area, scrolling only works when touching the small gaps between messages (the "sides").

### Fix
**File: `src/components/chat/SupportMessageBubble.tsx`**

Remove `touch-none` from the bubble's className (line 291). Replace it with `touch-manipulation`, which allows normal scrolling while still supporting the long-press gesture for reactions.

The long-press logic already uses `pointerDown`/`pointerUp` with a 500ms timer and cancels on `pointerCancel`/`pointerLeave`, so scrolling gestures will naturally cancel the timer when the browser starts scrolling — no additional logic needed.

### Summary of change
- One line change in `SupportMessageBubble.tsx`: swap `touch-none` → `touch-manipulation`

