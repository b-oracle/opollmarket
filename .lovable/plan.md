

## Plan: Expandable Space Recording Playback

### Problem
Currently, space recordings play inline on the SpaceCard with a minimal audio bar. There's no way to see who participated, who was speaking, or the chat/reactions from the original session — unlike Twitter/X Spaces replays which show an expanded view.

### Solution
Create a new `SpaceReplayModal` component that opens when a user taps a recorded space card. This expanded view will show:

1. **Full-screen modal/drawer** with the audio player at the bottom
2. **Participants list** — fetched from `space_participants` table, showing who joined with their roles (host, co-host, speaker, listener) and avatars
3. **Chat replay** — all `space_messages` for that space, displayed in a scrollable feed synced to the audio timeline (messages highlight/auto-scroll as playback progresses based on `created_at` timestamps)
4. **Reactions timeline** — reactions from `space_messages.reactions` shown as floating emoji overlays during playback

### What Changes

**New file: `src/components/social/SpaceReplayModal.tsx`**
- Full-screen modal with three sections:
  - **Top**: Space title, host info, duration, participant count
  - **Middle (tabbed)**: "Participants" tab showing avatar grid with roles; "Chat" tab showing timestamped messages that auto-scroll with playback
  - **Bottom (sticky)**: Enhanced audio player with play/pause, seek bar, skip buttons, current time/duration, and playback speed control (1x, 1.5x, 2x)
- Fetches participants from `space_participants` joined with `profiles` for display names and avatars
- Fetches all `space_messages` for the space, sorted by `created_at`
- During playback, highlights messages whose `created_at` falls before the current playback position (relative to `space.started_at`)
- Floating emoji reactions appear when the playback cursor passes a message with reactions

**Modified file: `src/components/social/SpaceCard.tsx`**
- When `isRecorded`, clicking the card (or the play button) opens `SpaceReplayModal` instead of playing inline
- Remove the inline audio player for recorded spaces (moved into the modal)

### Technical Details
- Audio playback position is mapped to the space timeline: `messageTimeOffset = message.created_at - space.started_at`; when `audio.currentTime` passes that offset, the message is highlighted
- Participants query: `supabase.from("space_participants").select("*, profiles(display_name, avatar_url, verification_level)").eq("space_id", id)`
- Messages query: `supabase.from("space_messages").select("*").eq("space_id", id).order("created_at")`
- Playback speed uses `audio.playbackRate`
- No database changes needed — all data already exists in `space_participants` and `space_messages`

