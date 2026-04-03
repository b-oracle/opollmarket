

## Fix Overly Stretched/Zoomed Market Card Background Images

### Problem
Market card background images in the feed appear overly zoomed and stretched. The current implementation uses `inset-[-30px_0]` (expanding the image 30px beyond the container on top and bottom for parallax) combined with `w-full h-full object-cover`, which over-crops images — especially portrait or non-standard aspect ratio images — making them look extremely zoomed in.

### Changes

**File: `src/components/MarketCard.tsx`**

1. **Reduce parallax overflow** (line ~297): Change `inset-[-30px_0]` to `inset-[-10px_0]` — this still allows subtle parallax movement but reduces the extra zoom/crop significantly.

2. **Use `object-top` instead of `object-center`** (line ~298): For market images (which often feature faces/subjects at the top), `object-top` keeps the important content visible rather than centering on the middle of an overly-cropped image.

3. **Increase opacity slightly** (line ~298): Bump from `opacity-40` to `opacity-50` so the image is more visible and the stretch is less jarring against the dark gradient.

**File: `src/lib/optimizedImage.ts`**

4. **Increase feed image quality/width**: The `feed` preset currently renders at 900px width. This is fine, but ensure it doesn't force an aspect ratio that causes distortion. No change needed here — the preset doesn't set height, so it preserves natural ratio.

### Summary
The core fix reduces the parallax expansion from 30px to 10px and shifts object positioning to `object-top`, preventing the overly-zoomed appearance while maintaining the atmospheric background effect.

