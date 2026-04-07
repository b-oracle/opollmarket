

## Plan: Fix Space Replay Modal Alignment and Scroll Bleed

### Problem 1: Play button misaligned with bottom nav Create button
The controls row has 5 items: speed, skip-back, play, skip-forward, and an invisible spacer button for symmetry. However the spacer approach doesn't perfectly center the play button over the bottom nav's Create button. The fix is to remove the spacer and use a simple centered layout with fixed-width containers on each side.

### Problem 2: Background page scrolls when scrolling inside the modal
The modal doesn't block touch events from propagating to the page underneath. When the user scrolls the participants or chat list and hits the boundary, the scroll "bleeds" through to the background page.

### Changes

**`src/components/social/SpaceReplayModal.tsx`**

1. Add `overscroll-behavior: contain` and `touch-action: none` on the root modal `motion.div` to prevent scroll bleed-through to the background page.

2. Add an `overflow-hidden` class on the root div to ensure no scroll leaks.

3. Replace the controls row layout: remove the invisible spacer button, and instead use a symmetrical layout where the left side (speed button) and right side are equal-width containers, with the 3 core buttons (skip-back, play, skip-forward) truly centered using flexbox.

**Controls layout change:**
```
<div className="flex items-center justify-between mt-1.5">
  <div className="w-10 flex justify-center">
    <speed button />
  </div>
  <div className="flex items-center gap-4">
    <skip-back />
    <play />
    <skip-forward />
  </div>
  <div className="w-10" /> <!-- empty spacer same width as speed button -->
</div>
```

This ensures the play button is dead-center on the screen regardless of the speed button width.

