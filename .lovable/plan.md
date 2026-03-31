

# Fix Feed Card Images — Zoomed Out / Poor Fit

## Problem
Feed card background images use `object-cover object-top` which works well for portrait/square images but causes landscape-oriented images to appear overly zoomed out or poorly framed. The parallax container also shifts the image by up to 30px, which can expose empty space at edges. Additionally, the "card" image preset is only 600px wide — too small for full-bleed backgrounds on modern screens, causing upscaling blur.

## Solution

### 1. Change image positioning to `object-center` (MarketCard.tsx, line 291)
- Replace `object-top` with `object-center` so the focal point of images (regardless of aspect ratio) stays centered in the card
- This prevents landscape images from being pushed to the top and looking zoomed out

### 2. Expand the image container to absorb parallax shift (line 290)
- Change from `inset-0` to `inset-[-30px_0]` (vertical only) so the image has 30px bleed on top and bottom
- This prevents the parallax translateY from revealing empty space at edges
- The parent `overflow-hidden` on line 288 clips the overflow cleanly

### 3. Add a "feed" image preset (optimizedImage.ts)
- Add a new preset `"feed": { width: 900, quality: 70 }` — better resolution for full-screen backgrounds without over-serving data
- Update the MarketCard to use `optimizedImageUrl(market.imageUrl, "feed")` instead of `"card"`

## Files Changed
- `src/components/MarketCard.tsx` — image container inset + object-position + preset name
- `src/lib/optimizedImage.ts` — add "feed" preset

