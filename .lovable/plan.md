

## Plan: Separate Feed Banner from Share Screenshot Overlay

Currently, the `captureContentRef` div in `MarketCard.tsx` (lines 165-235) serves double duty — it's both the visible background of the feed card AND the content captured for screenshots. This means the probability ring, category badge, and bottom text overlay are always visible on the feed.

### Changes

**`src/components/MarketCard.tsx`**

1. **Split the current `captureContentRef` div into two separate divs:**

   - **Visible banner div** (no ref): Keep only the background image + gradient + boost overlay. Remove the probability ring, category badge, and bottom text overlay from this div.
   
   - **Hidden capture div** (with `captureContentRef`): Move it offscreen using `absolute -left-[9999px]` with a fixed size (e.g., `w-[400px] aspect-video`), containing ALL the current screenshot content: background image, probability ring, category badge, bottom text overlay with title/description/badges/timestamp. This matches the Market Detail page's approach.

2. **Structure:**
```
<!-- Visible: just the background -->
<div className="absolute inset-0">
  {background image + gradient only}
  {boost overlay}
</div>

<!-- Hidden: full screenshot content -->
<div ref={captureContentRef} className="absolute -left-[9999px] w-[400px] aspect-video ...">
  {background image}
  {probability ring / multi indicator}
  {category badge}
  {bottom text overlay with title, badges, timestamp}
</div>
```

No changes needed to `ShareModal.tsx` — it already captures whatever `captureRef` points to.

