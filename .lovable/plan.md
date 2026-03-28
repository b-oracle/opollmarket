

# Fix: Space Persistence on Host/Co-Host Leave & Reconnection

## Problem
1. When the host taps the leave button (PhoneOff), `handleLeave` calls `end_space`, deleting the LiveKit room and ending the space for everyone. The user wants: leave = leave personally, only an explicit "End Space" button should terminate for all.
2. When the `Disconnected` event fires (e.g. network drop), `onClose()` is called immediately, removing the UI. Host/co-host should be able to rejoin and resume their role.
3. Minimizing works correctly (no disconnect), so no changes needed there.

## Changes

### 1. `src/components/social/SpaceRoom.tsx` — Separate "Leave" from "End Space"

**`handleLeave`**: Remove the `isHost` branch that calls `end_space`. Host leaving should just mark themselves as left in DB and disconnect from LiveKit — the space stays live.

**Add `handleEndSpace`**: New function (host-only) that calls the `end_space` action, deleting the room for everyone.

**`Disconnected` event handler**: Instead of calling `onClose()` immediately, show a "Reconnecting…" state and attempt to re-invoke `livekit-token` to get a fresh token and reconnect. Only call `onClose()` after a failed reconnect attempt (e.g. space has ended).

**UI changes in the controls bar**:
- The red PhoneOff button always does `handleLeave` (personal leave, space stays live).
- Add a separate "End Space" button visible only to the host — styled distinctly (e.g. red text button with label) — that calls `handleEndSpace`.

### 2. `supabase/functions/livekit-token/index.ts` — No changes needed
The `end_space` action already handles global termination correctly. The default JOIN action already restores host/co-host roles based on DB state, so reconnecting hosts will get their permissions back automatically.

### 3. Reconnection logic detail
On `RoomEvent.Disconnected`:
- If the user is host or co-host, attempt automatic reconnect by fetching a new token and calling `room.connect()` again (up to 3 retries with backoff).
- If the space has ended (token response says "ended"), then call `onClose()`.
- For regular listeners, show a toast and call `onClose()` as before.

## Files Modified
- `src/components/social/SpaceRoom.tsx`

