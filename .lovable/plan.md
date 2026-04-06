

## Plan: Fix Double-Tap / Multiple-Send Issues in Support Chat & Call Initiation

### Problem
1. **Support Chat**: The `sendMessage` function in `SupportChat.tsx` has no `sending` state guard. While the async insert runs (and the slow AI auto-reply awaits), nothing prevents the user from tapping Send again, causing duplicate messages.
2. **Call Initiation**: The DM `ChatView.tsx` already has a `calling` guard, but the Send button and call buttons don't show any visual loading state, making users think nothing happened and tap again.

### Changes

**File: `src/components/chat/SupportChat.tsx`**
- Add a `sending` boolean state
- Set it `true` at the start of `sendMessage`, check it as a guard (`if (sending) return`)
- Set it `false` in a `finally` block after the AI reply completes
- Disable the Send button when `sending` is true
- Show a `Loader2` spinner on the Send button while sending

**File: `src/components/chat/ChatView.tsx`**
- The `sending` guard already exists — just needs visual feedback
- Disable the Send button and show `Loader2` spinner when `sending` is true
- Disable the call buttons (Phone/Video) and show a spinner when `calling` is true, so users see immediate feedback

### Technical details
- Both fixes use the same pattern: guard boolean + disabled button + spinner icon swap
- Support chat clears `sending` only after the AI reply finishes (or fails), preventing any re-sends during that window
- Call buttons get `disabled={calling}` and swap the icon to `Loader2` with `animate-spin`

