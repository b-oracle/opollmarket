

## Fix Image Aspect Ratios in Status Cards and Market Feeds

### Problem
Images in social status posts and market feed cards can appear overly stretched because they use `w-full object-cover` without preserving their natural aspect ratio, causing distortion on wide or tall images.

### Changes

**File: `src/components/social/StatusCard.tsx`**

1. **Status post images** (line ~321): Replace the stretched `w-full object-cover max-h-60` with `object-contain` inside a constrained container so images maintain their natural aspect ratio:
   - Wrap in a `max-h-72 flex items-center justify-center bg-muted/20 rounded-lg overflow-hidden`
   - Change the `<img>` to `max-w-full max-h-72 rounded-lg object-contain` — this ensures images scale down to fit without stretching or cropping

2. **Market preview images inside status cards** (line ~306): These small 48x48 thumbnails are fine with `object-cover` — no change needed.

**File: `src/components/social/SocialAdCard.tsx`**

3. **Ad card market thumbnails**: Same pattern as StatusCard market previews — no change needed (already 48x48 cover thumbnails).

**File: `src/components/MarketCard.tsx`**

4. **Market card background images** (line ~298): These are intentional background fills with gradient overlays — `object-cover` is correct here. No change needed since they serve as atmospheric backgrounds, not primary image content.

### Summary
The core fix is in StatusCard's standalone image display: switching from `object-cover` (which crops) to `object-contain` (which preserves aspect ratio) inside a bounded container, so images never stretch beyond their natural proportions while staying within the card boundaries.

