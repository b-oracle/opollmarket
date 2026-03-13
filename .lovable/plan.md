

## Investigation: Feed Cards Hidden Behind Top Nav / Bleeding Into Adjacent Cards

### Root Cause

The issue stems from the interaction between **`scroll-snap-align: start`** and the **fixed top nav bar** combined with how the feed container's height and offset are calculated.

Here's what's happening:

1. **`scroll-snap-align: start` snaps to the top of the container**, but the container starts at `marginTop: calc(3.5rem + env(safe-area-inset-top))`. On some browsers/devices, `env(safe-area-inset-top)` resolves differently (or to `0px` when unsupported), causing the snap point to misalign with the visible area. The card snaps to the geometric top of the scroll container, but the **visible** top is obscured by the fixed TopBar.

2. **Height calculation mismatch**: The feed container height is:
   ```
   calc(100dvh - 3.5rem - env(safe-area-inset-top) - 4rem - env(safe-area-inset-bottom))
   ```
   Each card's height is set to `var(--feed-card-height)` which equals this same value. However, `100dvh` behaves inconsistently across browsers — on older Safari/Chrome versions it doesn't account for dynamic toolbars correctly, and `env()` safe-area values may not resolve on all devices. This means cards can be slightly taller or shorter than the visible viewport, causing the **bottom of one card to bleed into the next card's visible area**.

3. **`marginTop` vs `padding-top`**: The container uses `marginTop` to push below the nav bar. Since the scroll container's coordinate system starts at its own top (after margin), `scroll-snap-align: start` should theoretically work. But some browsers (especially WebKit-based) calculate the snap offset relative to the viewport rather than the container, causing the first ~56px of the card to sit behind the fixed header.

### Proposed Fix

1. **Switch snap alignment from `start` to `center`** — this is more resilient across browsers since it doesn't depend on the container's top edge aligning perfectly with the visible area. However, this changes the visual feel.

   **Better alternative**: Keep `start` but add `scroll-padding-top: 0px` explicitly on the `.snap-feed` container to ensure the snap destination accounts for the container's own boundaries (not the viewport).

2. **Replace `marginTop` with `padding-top` on the feed container** — this keeps the scroll container flush with the viewport top, and uses internal padding to offset content below the nav. Combined with `scroll-padding-top` matching the nav height, this ensures snap points land exactly at the visible top.

3. **Use `dvh` fallback with `vh`** — for browsers that don't support `dvh`, provide a fallback:
   ```css
   height: calc(100vh - 3.5rem - 4rem);
   height: calc(100dvh - 3.5rem - env(safe-area-inset-top, 0px) - 4rem - env(safe-area-inset-bottom, 0px));
   ```

4. **Set explicit `scroll-padding-top` on `.snap-feed`** in CSS to match the nav bar height, so snap points account for the fixed header overlap.

### Files to Change

- **`src/pages/Feed.tsx`**: Change the snap-feed container from using `marginTop` to being full-height with `paddingTop` instead. Set `scroll-padding-top` matching the nav bar height. Update the `--feed-card-height` CSS variable to match the actual visible card area.

- **`src/index.css`**: Add `scroll-padding-top` and `scroll-padding-bottom` to `.snap-feed` as defaults. Optionally add `vh` fallback before `dvh` declarations.

- **`src/components/MarketCard.tsx`**: No changes needed — it correctly uses `var(--feed-card-height)`.

### Summary

The core issue is that `scroll-snap-align: start` + `marginTop` + inconsistent `dvh`/`env()` support across browsers causes snap points to land behind the fixed nav or at slightly wrong heights. The fix is to make the feed container full-viewport-height, use `scroll-padding-top` to offset snap points past the nav bar, and provide `vh` fallbacks for `dvh`.

