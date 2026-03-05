

## Plan: Video link as additional option on market detail (not replacing image)

### Current behavior
- MarketCard (feed) shows YouTube video OR image as background — video replaces image
- MarketDetail page shows YouTube video OR image banner — video replaces image
- Create page doesn't appear to have a video URL field currently

### What changes

1. **Create page** — Add an optional "Video Link" text input below the image upload. Creators can add a YouTube URL alongside their image. Both fields are independent (image is always the cover, video is supplemental).

2. **MarketCard (feed)** — Always show the uploaded image as background. Never show YouTube video in the feed. Remove the video conditional branch.

3. **MarketDetail page** — Show the image banner as usual. If a video URL also exists, render the YouTube embed **below** the image banner (not replacing it). This gives the market detail page both the hero image and an embedded video player.

### Technical steps

| Step | File | Change |
|------|------|--------|
| 1 | `src/pages/Create.tsx` | Add optional `videoUrl` text input field. Pass `video_url` in the insert to the `markets` table. |
| 2 | `src/components/MarketCard.tsx` | Remove YouTube video branch — always use image background. Remove YouTubeEmbed import if unused. |
| 3 | `src/pages/MarketDetail.tsx` | Change logic: always show image banner. If `market.videoUrl` exists, render YouTubeEmbed as a separate section below the banner. |

No database changes needed — `video_url` column already exists on the `markets` table.

