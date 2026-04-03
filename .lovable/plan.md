

## Fix Status Card Images to Fill Container Width

### Problem
The current `object-contain` approach causes images to float in the center of the container without filling the width, resulting in narrow strips with empty space on both sides (visible in the screenshot).

### Fix

**File: `src/components/social/StatusCard.tsx`**

Change the image display from `object-contain` (which preserves ratio but doesn't fill width) to `w-full object-cover` with a capped aspect ratio container. This ensures images always fill the card width while preventing extreme vertical stretching.

Replace:
```tsx
<div className="max-h-72 flex items-center justify-center bg-muted/20 rounded-lg overflow-hidden">
  <img src={...} className="max-w-full max-h-72 rounded-lg object-contain" />
</div>
```

With:
```tsx
<div className="rounded-lg overflow-hidden bg-muted/20">
  <img src={...} className="w-full max-h-96 object-cover rounded-lg" />
</div>
```

- `w-full` makes the image fill the card width
- `max-h-96` caps height at 384px so tall images don't dominate the feed
- `object-cover` crops minimally to fill the width while keeping the image visually intact

