

## Plan: Magnify Feed Video to Fill Container

### Problem
YouTube iframes default to a 16:9 aspect ratio with letterboxing inside the container. The feed card container is taller than 16:9, so the video doesn't fill the space — black bars appear above/below.

### Solution
Apply CSS `object-fit: cover` equivalent for iframes by scaling the iframe beyond its container and hiding the overflow. This is the standard technique since iframes don't support `object-fit`.

### Changes

**`src/components/MarketCard.tsx`**
- Wrap the `YouTubeEmbed` in a container with `overflow-hidden` (already has `absolute inset-0`)
- Add scaling styles to the `YouTubeEmbed` className so the iframe is oversized and centered, cropping the letterbox bars

**`src/components/YouTubeEmbed.tsx`**
- Add a wrapper div around the iframe with `overflow-hidden` and scaling transform
- Use `scale-[1.5]` or similar to zoom the iframe so it fills the parent, cropping edges like `object-fit: cover` does for images

The visible UI card and desktop feed card will both benefit since they use the same component.

