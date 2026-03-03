

## Plan: Ensure Logo Watermark on Feed Share Screenshots

### Current State
The `ShareModal` component already contains watermark logic that draws `watermark-logo.png` on every screenshot. The `MarketCard` in the feed passes its `cardRef` to `ShareModal` as `captureRef`. In theory, the watermark should already appear.

### Potential Issue
The `html2canvas` library can struggle with `motion.div` elements (from framer-motion) and snap-scroll containers, which may cause the screenshot capture to fail silently — resulting in no screenshot and therefore no watermark.

### Changes

**`src/components/MarketCard.tsx`**
- Add a separate inner `div` ref (`captureContentRef`) wrapping just the visible card content (background image, content area, probability ring) — excluding the swipe overlay and interactive side buttons.
- Pass `captureContentRef` instead of `cardRef` to `ShareModal` so `html2canvas` captures a clean, static `div` rather than a `motion.div`.

This ensures:
1. `html2canvas` gets a standard `div` (not a framer-motion element) for reliable capture.
2. The watermark logo (already coded in `ShareModal`) renders correctly on the captured image.
3. Side action buttons (like/comment/share) are excluded from the screenshot for a cleaner result.

### Scope
- One file changed: `src/components/MarketCard.tsx`
- No changes needed to `ShareModal.tsx` — watermark logic is already there.

