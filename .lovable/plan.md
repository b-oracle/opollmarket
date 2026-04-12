

## Why Share Image Works from Detail but Not from Feed

### Root Cause
Both pages use a hidden off-screen div (positioned at `-9999px`) containing an `<img>` tag for the market image. The `ShareModal` captures this div using `html2canvas`.

- **Detail page**: The market image is already visible on the page, so the browser has it cached. When the hidden capture div is moved on-screen, the image loads instantly from cache.
- **Feed page**: The market image in the card itself uses a different rendering path (often a `YouTubeEmbed` or gradient overlay). The hidden capture div's `<img>` at `-9999px` may never start loading because the browser deprioritizes off-screen images. When `html2canvas` runs, the image is blank or partially loaded, producing a broken screenshot.

### Fix

**`src/components/MarketCard.tsx`** — Force the hidden capture image to preload when the share modal opens (not before), ensuring it is fully loaded before `html2canvas` runs.

1. Add `loading="eager"` and `decoding="sync"` to the capture div image (already has `loading="eager"`, but it's still off-screen).
2. Better approach: instead of relying on the off-screen div's image, **programmatically preload the image into a temporary `Image()` object** when the share button is tapped, _before_ setting `shareOpen = true`. This guarantees the browser has it in its cache.

Concretely:
- In the share button handler, create `new Image(); img.src = market.imageUrl` and wait for its `onload` (with a 2s timeout), then open the share modal.
- This ensures by the time `html2canvas` runs on the hidden div, the image is in the browser's memory cache.

### Files changed
- `src/components/MarketCard.tsx` — update share button handler to preload the market image before opening `ShareModal`

