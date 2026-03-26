

# Add Co-Host Feature to Spaces

## Overview
Allow the host to designate one or more participants as co-hosts. Co-hosts get the same moderation powers as the host (promote, demote, mute, kick) but cannot end the space or manage other co-hosts.

## Database Changes

### Migration: Add `co_host_ids` array to `spaces` table
```sql
ALTER TABLE public.spaces ADD COLUMN co_host_ids uuid[] NOT NULL DEFAULT '{}';
```
Alternatively, a separate `space_co_hosts` table, but an array column is simpler since co-host count will be small (1-3).

## Backend Changes

### `supabase/functions/livekit-token/index.ts`
1. Update the space query to include `co_host_ids`
2. Create `isCoHost = (space.co_host_ids || []).includes(userId)`
3. Update `requireHost()` to `requireHostOrCoHost()` — allows host OR co-host for: promote, demote, mute, kick
4. Keep `isHost`-only gating for ending the space
5. On JOIN: if user is a co-host, grant `canPublish: true` (same as host)
6. Return `isCoHost` flag in the response alongside `isHost`

### New action: `make_cohost` / `remove_cohost`
- Host-only action (not co-host)
- Updates `spaces.co_host_ids` array (append/remove)
- Updates participant role to `"co_host"` in `space_participants`

## Frontend Changes

### `src/components/social/SpaceRoom.tsx`
1. Add `isCoHost` state from token response
2. Allow co-hosts to see and use the participant action sheet (promote/demote/mute/kick) — same as host
3. Co-hosts get mic access and mute toggle (like speakers but with mod powers)
4. Add "Make Co-Host" option in the host's action sheet for speakers
5. Show a crown/star badge next to co-host names
6. Co-hosts do NOT see: end space button, recording controls, or "Make Co-Host" for others

### `src/components/social/SpaceCard.tsx`
- Show co-host names alongside host name if desired (optional, minor)

## Files to modify
- `supabase/functions/livekit-token/index.ts` — auth and action logic
- `src/components/social/SpaceRoom.tsx` — UI for co-host powers and badge
- Database migration — add `co_host_ids` column

