

## Watch YouTube/StreamYard Streams Inside Live Spaces

### Overview
Allow Space hosts to paste a YouTube Live or StreamYard URL so all participants can watch the stream embedded directly in the Space UI alongside the existing audio chat.

### Database Change
Add a `stream_url` column to the `spaces` table:
```sql
ALTER TABLE public.spaces ADD COLUMN stream_url text DEFAULT null;
```
No RLS changes needed — existing policies cover spaces table access.

### Backend
No new edge functions required. The host updates `stream_url` via the existing Supabase client, and all participants receive the change through the existing Postgres Realtime subscription on the `spaces` table.

### Frontend Changes

**1. SpaceRoom.tsx — Host stream URL input**
- Add a `streamUrl` state variable, initialized from the space record
- For hosts/co-hosts: add a "Share Stream" button (TV/Monitor icon) that opens a small input field to paste a YouTube Live or StreamYard URL
- On submit, update `spaces.stream_url` in the database
- Host can clear the URL to stop showing the stream
- Subscribe to realtime changes on `stream_url` so all participants see updates instantly

**2. SpaceRoom.tsx — Embedded player for all participants**
- When `streamUrl` is set, render the existing `YouTubeEmbed` component (already in the codebase) above the participants grid
- For StreamYard URLs (which output to YouTube), the host pastes the YouTube Live URL — no special handling needed
- Wrap in a collapsible/expandable container so participants can minimize the video if they prefer audio-only
- The embed uses `autoplay=1&mute=1` (already configured in YouTubeEmbed) so it doesn't conflict with Space audio

**3. CreateSpaceModal.tsx — Optional stream URL field**
- Add an optional "Stream URL" text input when creating/scheduling a space
- Validates that it's a valid YouTube URL using the existing `isYouTubeUrl` helper

**4. SpaceMiniPlayer.tsx — Stream indicator**
- Show a small TV icon when the active space has a stream, so users know video is available when they expand

### Technical Notes
- Reuses the existing `YouTubeEmbed` component and `getYouTubeId`/`isYouTubeUrl` utilities — no new dependencies
- StreamYard streams go to YouTube, so pasting the YouTube Live link works for both platforms
- The existing Realtime subscription on the spaces table will pick up `stream_url` changes automatically
- Only hosts and co-hosts can set/clear the stream URL (enforced in UI + can add RLS update policy check if needed)

### Files to modify
1. **Database migration** — add `stream_url` column
2. `src/components/social/SpaceRoom.tsx` — stream input (host) + embedded player (all)
3. `src/components/social/CreateSpaceModal.tsx` — optional stream URL field
4. `src/components/social/SpaceMiniPlayer.tsx` — stream indicator icon

### Important prerequisite
The current build has stale error reports but compiles cleanly. The implementation will also fix any remaining structural issues in SpaceRoom.tsx if encountered during editing.

