

## Fix: Reaction Bar Visibility and Positioning in DM Chat

### Problems
1. The **"+" button** (to open full emoji picker) is clipped/hidden on mobile — the reaction bar overflows or gets cut off on small screens.
2. The reaction bar uses **fixed positioning** based on initial coordinates, so it **detaches from the bubble** when the user scrolls.

### Solution

**File: `src/components/chat/ChatMessageBubble.tsx`**

1. **Sticky positioning instead of fixed**: Change the reaction bar from `fixed` with absolute `top/left` coordinates to being rendered **inside the bubble's relative container** using `absolute` positioning. This keeps it anchored to the message bubble regardless of scroll position.

2. **Ensure "+" button visibility**: The current bar uses `rounded-full px-2` with 6 emojis + "+" + copy/delete buttons, which overflows on narrow screens. Fix by:
   - Reducing emoji button padding slightly
   - Adding `overflow-visible` and ensuring the bar doesn't get clipped by parent `overflow-hidden`
   - Using `right-0` or `left-0` anchoring based on `isMine` to keep it within viewport

3. **Positioning logic**: Remove the `pickerPos` state that calculates viewport-absolute coordinates. Instead, render the bar as an absolutely-positioned child above the bubble (`bottom-full mb-1`), aligned left for received messages and right for sent messages.

4. **Backdrop stays fixed**: The dismiss overlay remains `fixed inset-0` as it should cover the whole screen.

### Technical Details

```text
Before (fixed, detaches on scroll):
  ┌─────────────────────────┐  ← fixed top/left
  │ ❤️ 😂 👍 😮 😢 🔥 [+] │
  └─────────────────────────┘
         ... scroll ...
  ┌───────────┐
  │  message  │  ← bubble scrolled away
  └───────────┘

After (absolute, anchored to bubble):
  ┌───────────┐
  │ ❤️😂👍😮😢🔥[+]📋🗑│  ← absolute, bottom-full
  ├───────────┤
  │  message  │
  └───────────┘
```

### Files Changed
| File | Change |
|------|--------|
| `src/components/chat/ChatMessageBubble.tsx` | Replace fixed-position reaction bar with absolute-positioned bar anchored to bubble; remove `pickerPos` state; adjust sizing for mobile |

