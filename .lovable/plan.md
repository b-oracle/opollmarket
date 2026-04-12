

## Plan: Auto-play YouTube video on Feed cards when video_url exists

When a market has a `video_url`, replace the static banner image in the feed card with an auto-playing, muted, looping YouTube embed.

### Changes

**1. `src/components/MarketCard.tsx`**
- In the banner section (lines ~300-317), check if `market.videoUrl` exists and is a valid YouTube/stream URL
- If yes, render `<YouTubeEmbed>` (already supports autoplay+mute+loop) instead of the `<img>` tag, with `fallbackImage` set to `market.imageUrl`
- The embed fills the same `absolute inset-0` container with the gradient overlay on top for text readability
- Import `YouTubeEmbed` and `isStreamUrl` from `@/components/YouTubeEmbed`

**2. `src/pages/Feed.tsx` — `DesktopFeedCard`**
- Same logic in the desktop card's image section (lines ~93-106): if `market.videoUrl` exists, render the YouTube embed instead of the `<img>`

### Technical details

The `YouTubeEmbed` component already renders with `autoplay=1&mute=1&loop=1` params. It also has a fallback mechanism — if the video is unavailable, it falls back to the provided `fallbackImage`. The video will be muted by default (browser requirement for autoplay). The existing gradient overlay remains on top so title text stays readable.

