

## Toggle-Based Live Stream Selection in Spaces

### UX Flow
```text
[ ] Enable Live Stream          ← toggle off by default

  ↓ (when toggled on)

  [YouTube]  [StreamYard]       ← platform picker (radio buttons)

  ↓ (after selecting platform)

  [ Paste your YouTube Live URL… ]   ← contextual input + validation
```

### Changes

**1. `src/components/YouTubeEmbed.tsx`**
- Add `getStreamYardId(url)` helper to extract ID from `streamyard.com/watch/...` or `streamyard.com/...`
- Add `isStreamYardUrl(url)` check
- Export a combined `isStreamUrl(url)` that checks either platform
- Render StreamYard embeds as `<iframe src="https://streamyard.com/watch/{id}?embed=true" />`

**2. `src/components/social/CreateSpaceModal.tsx`**
- Replace the current always-visible stream URL input with:
  - A toggle button "Enable Live Stream" (reuse the same style as the Private Space toggle)
  - When on, show two radio-style platform buttons: YouTube | StreamYard
  - Below that, show the URL input with platform-specific placeholder and validation
- Store `streamPlatform` state (`"youtube" | "streamyard"`)
- Validate URL against the selected platform before submit

**3. `src/components/social/SpaceRoom.tsx`**
- Replace `isYouTubeUrl` checks with `isStreamUrl` for the host inline-edit validation
- Pass the URL to the updated embed component which auto-detects the platform
- Update placeholder and error text to reflect selected platform (or generic "stream URL")

**4. `src/components/social/SpaceMiniPlayer.tsx`**
- No changes needed — already uses a generic TV icon for any stream

### No database changes
The `stream_url` column is already a generic `text` field. Platform detection happens client-side from the URL pattern.

