

# Fix Co-Host Cannot Accept Speaker Requests

## Root Cause
When a host makes someone a co-host mid-session, the new co-host's client never updates its `isCoHost` state. It's only set during the initial JOIN response from the edge function. So `hasModPowers` remains `false` for the new co-host, hiding all moderation UI (accept/decline requests, promote, demote, mute, kick).

Additionally, `spaceCoHostIds` is only refreshed on the host's client after the `make_cohost` action — other participants don't see it update either.

## Fix (SpaceRoom.tsx)

### 1. Broadcast co-host change via data channel
After the host successfully makes/removes a co-host, broadcast a data message with the updated co-host list so all participants update their local state.

In `invokeAction`, after refreshing `spaceCoHostIds` for `make_cohost`/`remove_cohost`:
- Broadcast `{ type: "cohost_update", coHostIds: [...] }` via the data channel

### 2. Handle `cohost_update` in `handleDataReceived`
- Update `spaceCoHostIds` from the received list
- If the current user's ID is in the new list, set `isCoHost = true`
- If the current user's ID was removed, set `isCoHost = false`
- This immediately updates `hasModPowers` for the affected user

### 3. Also listen for LiveKit permission changes
Add a `RoomEvent.ParticipantPermissionsChanged` listener. When the co-host's permissions change to `canPublish: true` (from the edge function's `make_cohost` action), update `canPublish` state. This handles the audio publish permission side.

### 4. Handle rejoining as co-host
The JOIN path already returns `isCoHost` correctly from the edge function, so rejoins are fine. No change needed there.

## Files Modified
- `src/components/social/SpaceRoom.tsx` — broadcast co-host updates, handle in data channel, listen for permission changes

