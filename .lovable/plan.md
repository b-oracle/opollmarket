

# Mute All Speakers + Force-Mute Lock

## Problem
Currently, hosts/co-hosts can only mute speakers one at a time via the edge function. Muted speakers can immediately unmute themselves. There's no "Mute All" button and no mechanism to prevent speakers from re-enabling their mic.

## How It Works

### Server Side — `livekit-token` edge function
1. **New `mute_all` action**: Iterates all participants in the room via `RoomServiceClient.listParticipants`, mutes every audio track except the caller's (host/co-host).
2. **Force-mute flag via data channel**: After muting server-side, the edge function doesn't need to track state — the client broadcasts the lock state.

### Client Side — `SpaceRoom.tsx`

1. **New state**: `forceMuted` (boolean) — when true, the local user's mic toggle is disabled and shows a lock icon with "Muted by host" label.

2. **"Mute All" button**: Visible to host/co-hosts in the control bar area. When tapped:
   - Calls `invokeAction("mute_all")` which server-side mutes all speakers' audio tracks
   - Broadcasts `{ type: "force_mute", targets: "all" }` via data channel
   - All non-host/non-cohost speakers set `forceMuted = true` and `muted = true`

3. **Individual force-mute**: When host/co-host mutes a specific speaker via the existing action sheet:
   - After successful `invokeAction("mute", targetId)`, broadcast `{ type: "force_mute", targets: [targetId] }`
   - Target speaker sets `forceMuted = true`

4. **"Unmute All" button**: Replaces "Mute All" when active. When tapped:
   - Broadcasts `{ type: "force_unmute", targets: "all" }` via data channel
   - All speakers set `forceMuted = false` (mic stays muted, but they can now toggle it)

5. **Individual unmute**: New action sheet button "Allow to unmute" for force-muted speakers:
   - Broadcasts `{ type: "force_unmute", targets: [targetId] }`
   - Target sets `forceMuted = false`

6. **Data channel handling** in `handleDataReceived`:
   - `force_mute`: If current user is in targets (or targets === "all") and not host/co-host, set `forceMuted = true`, disable mic, show toast "You've been muted by the host"
   - `force_unmute`: If current user matches, set `forceMuted = false`, show toast "You can now unmute"

7. **Mic toggle guard**: In `toggleMute`, if `forceMuted` is true, show toast "You've been muted by the host" and return early — do not allow unmuting.

8. **Visual indicator**: Force-muted speakers show a 🔇 badge on their avatar. The mic button shows a lock icon when force-muted.

### Edge Function Changes — `livekit-token`
Add `mute_all` action:
```
if (action === "mute_all") {
  requireMod();
  const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  const participants = await svc.listParticipants(roomName);
  for (const p of participants) {
    if (p.identity === userId) continue; // skip self
    if (p.tracks) {
      for (const track of p.tracks) {
        if (track.type === 1) {
          await svc.mutePublishedTrack(roomName, p.identity, track.sid, true);
        }
      }
    }
  }
  return success response;
}
```

## Files Modified
- `supabase/functions/livekit-token/index.ts` — add `mute_all` action
- `src/components/social/SpaceRoom.tsx` — add force-mute state, Mute All/Unmute All buttons, data channel handling, mic toggle guard, visual indicators

