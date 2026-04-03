

## Add Empty State to Chat View

### What changes

**`src/components/chat/ChatView.tsx`**

In the messages area (the scrollable div), when `messages.length === 0`, render a centered empty state instead of nothing:

- A large friendly emoji (e.g. 👋 or 💬) as a visual focal point
- Heading: **"No messages here yet..."**
- Subtext: "Send a message or a gift to start the conversation."
- Styled centered vertically and horizontally in the message area
- Uses muted colors consistent with the app's design system
- The emoji renders large (~64px) as a substitute for the Telegram-style illustration

### No other files or database changes needed

