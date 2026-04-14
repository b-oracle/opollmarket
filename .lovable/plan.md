

## Fix: Quick Trade rounds appearing stuck after countdown for forex/commodities/metals

### Problem
When a Quick Trade round's countdown reaches zero, the client fetches the round again after 2 seconds. But the server-side resolution runs on a 1-minute cron cycle, so for up to 60 seconds the round remains in "open/locked" status. The client keeps re-displaying it at 0:00, making trades appear "pending" or stuck. Crypto resolves faster because its price APIs respond quickly, but forex/commodities/metals often hit the full cron delay.

### Root Cause
- The `resolve-quick-round` edge function is only triggered by a cron job every 60 seconds
- After countdown ends, the client's `fetchActiveRound` finds the same unresolved round and sets it as active again with 0:00 remaining
- No client-side mechanism to trigger resolution or show a waiting state

### Solution (two parts)

**1. Client-side: trigger resolution proactively and show "Resolving..." state**
- When countdown hits 0, call the `resolve-quick-round` edge function directly (fire-and-forget POST) to trigger immediate resolution instead of waiting for cron
- Add a `resolving` UI state: when timeLeft is 0 and the round is still active, show "Resolving..." instead of "0:00" with a spinner
- Implement a polling retry: after the initial 2s, poll every 3s (up to 30s) checking if the round status changed to "resolved", then transition to the next round

**2. Server-side: ensure the edge function handles concurrent calls safely**
- The resolve function already handles this safely (it only updates rounds past their end time), so no server changes needed

### Files Changed
- `src/pages/QuickTrade.tsx` — Update the countdown `useEffect` (lines 1008-1023) to:
  - Call `resolve-quick-round` edge function when countdown expires
  - Add polling with exponential backoff until round resolves
  - Show "Resolving..." indicator in the UI during the wait period
  - Clear active round and fetch a new one once resolved

### Technical Detail
```text
Current flow (broken UX):
  Countdown → 0 → wait 2s → fetchActiveRound → finds same unresolved round → shows 0:00 → repeat

Fixed flow:
  Countdown → 0 → show "Resolving..." → POST resolve-quick-round → poll every 3s
  → round resolved → show result → clear → fetch new round
```

