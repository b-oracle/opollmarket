

## Replace General Floating Reaction Emojis

### What changes

**File: `src/components/social/SpaceRoom.tsx`**

Replace the first four money-themed emojis in the `REACTIONS` array (used for general floating reactions) with skin-toned hand gestures, reserving the money emojis exclusively for the gift emoji picker.

**Line 78** — Change:
```
const REACTIONS = ["💸", "🤑", "💰", "💵", "🌹", "💝", "🔥", "🕺", "💃", "👏", "👍", "❤️", "😂", "💯", "🎯"];
```
To:
```
const REACTIONS = ["🙏🏽", "👎🏽", "✌🏽", "👌🏽", "🌹", "💝", "🔥", "🕺", "💃", "👏", "👍", "❤️", "😂", "💯", "🎯"];
```

No other changes needed — the money emojis (`💸`, `🤑`, `💰`, `💵`) remain in `EMOJI_PRICES` and the gift emoji picker, so gifting is unaffected.

