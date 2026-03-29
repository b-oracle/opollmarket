

# Space Room Fixes — 6 Issues

## 1. Duplicate Messages
**Root cause**: `sendChat()` adds the message locally (optimistic, line 942-953) AND broadcasts via data channel. Other peers receive via data channel (line 346-368) AND also via Postgres realtime subscription (line 134-163). The dedup key at line 350 uses `Math.floor(Date.now() / 2000)` which doesn't match the DB-generated `id`, so the same message can appear from both channels.

For the sender: the message is added optimistically at line 942, but the data channel handler at line 344 doesn't skip own messages (it checks `participant?.identity` but the sender also receives their own data channel broadcast in some cases). Meanwhile the realtime handler at line 144 skips own user messages — good.

**Fix**: In `handleDataReceived` for `type === "message"`, also skip if `participant?.identity === user?.id` (sender shouldn't process their own data channel messages). Also, use the `loadedMsgIdsRef` more reliably by adding the optimistic local ID pattern to be matchable against the dedup key.

## 2. Chat Reactions Disappear on Re-join
**Root cause**: Reactions are stored only in local state via data channel broadcasts — no persistence. When a user leaves and re-joins, the messages are loaded from `space_messages` table which has no reactions column.

**Fix**: Add a `reactions` JSONB column to `space_messages` table. When a user reacts, update the DB row. When loading messages on join, include the reactions data.

## 3. Add Timestamps to Messages
**Root cause**: Messages in chat don't show timestamps.

**Fix**: Add time display (e.g. `HH:mm`) next to each message bubble using the existing `timestamp` field.

## 4. Recording Stops When Host Leaves/Gets Interrupted
**Root cause**: Recording uses `MediaRecorder` tied to the host's browser. If the browser tab gets interrupted (backgrounded, phone call), the `AudioContext` may suspend and `MediaRecorder` stops receiving data. The visibility handler resumes `AudioContext` but doesn't restart the `MediaRecorder` if it stopped.

**Fix**: In the visibility handler, check if recording is active but `MediaRecorder.state` is `"inactive"` and restart it. Also, save chunks periodically to prevent data loss.

## 5. Host/Co-Host Ordering in Participants Grid
**Root cause**: `speakers` array at line 1111 is just `participants.filter(...)` with no sorting — order depends on when LiveKit reports them.

**Fix**: Sort the `speakers` array so host appears first, co-hosts second, then other speakers alphabetically.

## 6. Reactions Should Show Who Reacted (Tooltip)
**Root cause**: Reaction buttons show emoji + count but no user names.

**Fix**: Add a tooltip/popover on tap showing display names of users who reacted. Fetch names from profiles.

---

## Implementation Details

### Database Migration
```sql
ALTER TABLE public.space_messages ADD COLUMN reactions JSONB NOT NULL DEFAULT '{}'::jsonb;
```

### File: `src/components/social/SpaceRoom.tsx`

**Fix 1 — Duplicate messages**: In `handleDataReceived` callback for `type === "message"`, add early return if `participant?.identity === user?.id`.

**Fix 2 — Persist reactions**: 
- When loading messages, map `m.reactions` from DB into the `ChatMessage.reactions` field.
- In `reactToMessage()`, after updating local state, also call `supabase.from("space_messages").update({ reactions })` for that message row.
- In `handleDataReceived` for `msg_reaction`, also update is fine (peers update via data channel for instant, but DB is source of truth on re-join).

**Fix 3 — Timestamps**: In the chat message rendering (line 1257-1292), add a `<p>` showing `new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` below or beside each bubble.

**Fix 4 — Recording resilience**: In the `handleVisibility` effect (line 240-274), add a check: if `recording` is true and `mediaRecorderRef.current?.state === "inactive"`, call `startClientRecording()` to restart. Also in `stopClientRecording`, handle the case where recorder is already inactive but chunks exist (still upload them).

**Fix 5 — Participant ordering**: After computing `speakers` at line 1111, sort them:
```typescript
speakers.sort((a, b) => {
  if (a.identity === hostId) return -1;
  if (b.identity === hostId) return 1;
  const aCoHost = coHostIds.includes(a.identity);
  const bCoHost = coHostIds.includes(b.identity);
  if (aCoHost && !bCoHost) return -1;
  if (!aCoHost && bCoHost) return 1;
  return a.name.localeCompare(b.name);
});
```

**Fix 6 — Reaction tooltip**: When a reaction button is tapped/held, show a small popover listing the display names of users who reacted. Use profile data already available in `profiles` state, or fetch missing ones.

### Files Modified
- **New migration**: adds `reactions` JSONB column to `space_messages`
- **`src/components/social/SpaceRoom.tsx`**: all 6 fixes

