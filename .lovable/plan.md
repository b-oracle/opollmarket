

## Add Full Emoji Picker for Message Reactions

### Problem
Message reactions are limited to 6 hardcoded emojis (`❤️ 😂 👍 😮 😢 🔥`). The user wants a full emoji picker like the native iOS/WhatsApp one shown in the screenshot — with categories, search, and the complete emoji set.

### Solution
Install an emoji picker library (`emoji-picker-react` — lightweight, works well in React) and add a "+" button to the existing quick-reaction bar. Tapping "+" opens the full picker below/above the message.

### Steps

**1. Install `emoji-picker-react`**
- `npm install emoji-picker-react`

**2. Update `ChatMessageBubble.tsx`**

- Keep the existing 6 quick-reaction emojis in the floating bar (fast access)
- Add a "+" button at the end of the bar (like WhatsApp)
- When "+" is tapped, replace the small pill bar with a full emoji picker panel (fixed position, same z-index)
- On emoji select from the full picker, call `toggleReaction(emoji)` and close
- The picker renders in dark/light mode matching the app theme

**3. Picker positioning**
- Render the full picker as a fixed overlay near the message bubble
- On mobile (402px viewport), make it full-width at bottom of screen for easy thumb reach
- Backdrop click dismisses it

### UI Flow
1. Long-press message → quick bar appears with `❤️ 😂 👍 😮 😢 🔥 ➕`
2. Tap any quick emoji → reaction applied immediately
3. Tap ➕ → full emoji picker slides up from bottom
4. Pick any emoji → reaction applied, picker closes

### Files Changed
- `package.json` — add `emoji-picker-react`
- `src/components/chat/ChatMessageBubble.tsx` — add "+" button, full picker state, import picker component

