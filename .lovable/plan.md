

# Fix: Market Feed Image Display (Zoomed/Deformed)

## Problem
Market card images appear overly zoomed and deformed on the feed. Two causes:

1. **Parallax overflow**: The image container uses `inset-[-30px_0]` (extends 30px above and below the card), making images appear zoomed in and cropped excessively.
2. **Small optimized size**: The `"card"` image preset is only 400px wide, which gets upscaled on larger screens causing blur/distortion.

## Fix

### File: `src/components/MarketCard.tsx`

**Line ~290** — Reduce the parallax overflow from `-30px` to `-10px` so the image doesn't appear as zoomed:
```
inset-[-30px_0]  →  inset-[-10px_0]
```

Also add `object-position: center` to ensure the image focal point stays centered rather than shifting.

### File: `src/lib/optimizedImage.ts`

Increase the `"card"` preset width from 400 to 600 to reduce upscaling blur on feed cards:
```
card: { width: 600, quality: 75 }
```

### Summary
- 2 files, ~2 lines changed each
- No backend changes

