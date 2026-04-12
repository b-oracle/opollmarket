

## Plan: Live Match Streaming on Market Detail Pages

Add the ability for market creators to go live or embed external streams directly on their market's detail page. This leverages your existing LiveKit infrastructure (already used for Spaces) and the YouTube/StreamYard embed system.

### How it works

**Two streaming modes (both available to market creators):**

1. **Embed a third-party stream** — Paste a YouTube Live or StreamYard URL. It renders as an embedded player on the market detail page for all viewers. Free, no hosting cost.

2. **Go Live with LiveKit** — The market creator starts a live audio/video broadcast directly from the market page. Viewers watch/listen in real-time. Uses your existing LiveKit setup (same as Spaces). Cost is whatever your LiveKit plan charges for media bandwidth.

### Database changes

**Migration: Add `stream_url` and `is_streaming` columns to `markets` table**
```sql
ALTER TABLE markets ADD COLUMN stream_url text;
ALTER TABLE markets ADD COLUMN is_streaming boolean DEFAULT false;
```

### Backend changes

**1. New edge function: `market-stream-token/index.ts`**
- Simplified version of `livekit-token` scoped to markets
- Validates the caller is the market creator (for publishing) or any authenticated user (for subscribing)
- Actions: `start_stream` (creates LiveKit room, sets `is_streaming = true`), `stop_stream`, `join` (viewer gets subscribe-only token)
- Room name: `market-{market_id}`

### Frontend changes

**2. `src/pages/MarketDetail.tsx`**
- Below the banner, show a stream section:
  - If `market.streamUrl` exists → embed via `YouTubeEmbed`
  - If `market.isStreaming` → show LiveKit video player for viewers
  - If current user is the market creator and market is active → show "Go Live" button (opens a simple stream control panel) and "Share Stream" button (paste YouTube/StreamYard URL)
- When creator clicks "Go Live": call `market-stream-token` with `action: "start_stream"`, connect to LiveKit, publish camera/mic
- Viewers see a "LIVE" badge on the market card and detail page

**3. `src/components/MarketCard.tsx` and `src/pages/Feed.tsx`**
- Show a small red "LIVE" badge on market cards where `is_streaming = true`

**4. New component: `src/components/MarketStreamPlayer.tsx`**
- LiveKit-based viewer component (subscribe-only, shows host video/audio)
- Uses `@livekit/components-react` (already a dependency for Spaces)
- Includes mute/fullscreen controls

**5. New component: `src/components/MarketStreamControls.tsx`**
- For the market creator: camera/mic toggle, stop stream button
- Connects to LiveKit with publish permissions

### Feature toggle

Add a `market_streaming` toggle to `feature_toggles` so this can be enabled/disabled from admin settings.

### Cost note

- **Embedded streams (YouTube/StreamYard)**: Free — no server cost
- **LiveKit self-hosted streams**: Paid based on your LiveKit Cloud plan (bandwidth + participant minutes). Your existing LiveKit keys work for this.

### Technical details

- LiveKit room naming: `market-{market_id}` (distinct from `space-{space_id}`)
- Only one active stream per market at a time
- When stream ends, `is_streaming` resets to `false` and the room is deleted
- The `stream_url` field on markets is separate from `video_url` (which is for pre-recorded YouTube embeds); `stream_url` is for live external streams

