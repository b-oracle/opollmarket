

## Fix Call Session Not Ending Properly

### Problem
Calls get stuck in "ringing" or "active" state in the database, causing "there is an ongoing call" errors when trying to start a new call. Three scenarios need proper auto-cleanup:

1. **User ends call manually** — `handleEnd` fires but can fail silently (error swallowed), leaving DB in stale state
2. **No communication for 1 minute** — no inactivity timeout exists during active calls
3. **Call not picked up** — 60s timeout exists client-side but uses stale `status` closure (always reads initial value), so it never triggers `handleCancel`

### Root Causes
- **Stale closure bug**: The `autoTimeoutRef` callback captures `status` from initial render ("ringing"), but the check `if (status === "ringing")` reads the stale closure value. Since the status state variable starts as "ringing" for outgoing, this should work — but it's fragile and should use a ref instead.
- **No server-side cleanup**: If the client crashes or loses connection, no backend mechanism cleans up active calls (only stale ringing calls > 90s are cleaned).
- **No inactivity timeout**: Once a call becomes "active", there's no mechanism to auto-end if both parties go silent.
- **LiveKit room `emptyTimeout` is 120s** but the DB record isn't updated when the room auto-closes.

### Solution

**1. Client-side fixes (`VoiceCallOverlay.tsx`)**
- Use a `statusRef` to track current status, fixing the stale closure in the auto-timeout
- Add a 60-second inactivity timer during active calls — if no remote audio track is ever received, auto-end
- Ensure `handleEnd`/`handleCancel` are called on component unmount if call is still active
- Guard against double-invocation of end/cancel actions with a ref flag

**2. Server-side cleanup (`dm-call-token/index.ts`)**
- When checking for existing calls (start action), also clean up stale **active** calls older than 2 hours
- Clean up **ringing** calls older than 60 seconds (reduce from current 90s)
- On "end" action, don't fail if call is already ended — return success silently (prevents "failed to connect" error toast)

**3. LiveKit room empty timeout (`dm-call-token/index.ts`)**
- Reduce `emptyTimeout` from 120s to 60s so rooms self-destruct faster when both parties disconnect

### Files Changed
| File | Change |
|------|--------|
| `src/components/chat/VoiceCallOverlay.tsx` | Add statusRef, fix stale closure, add inactivity timeout, guard double-end |
| `supabase/functions/dm-call-token/index.ts` | Clean stale active calls, tolerate already-ended calls, reduce emptyTimeout |

