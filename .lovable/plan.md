

# Add In-Bot "Link Account" Button to Daily Digest

## Problem
The unlinked user digest currently has a "Link Account & Start Trading" button that opens the website (`/auth`). The user wants a "Link Account" button that triggers the in-bot linking flow (like the rest of the bot uses).

## Changes

### File: `supabase/functions/telegram-daily-digest/index.ts`

The `buttons` array for unlinked users (line 132-134) currently uses a `url` button. Change it to use a `callback_data` button so it triggers the bot's existing `/link` flow, and add a separate web URL button for exploring.

**Lines 99, 132-147** — Update the button type definition to support both `url` and `callback_data` buttons, then replace the link button:

```typescript
// Change buttons type to support callback_data
let buttons: Array<Array<{ text: string; url?: string; callback_data?: string }>>;

// Unlinked user buttons:
buttons = [
  [{ text: "🔗 Link Account", callback_data: "cmd_link" }],
];

// Keep the rest (market buttons + explore) as-is
```

Also update the linked user section's button type accordingly (line 250).

### Summary
- 1 file, ~3 lines changed
- No backend changes

