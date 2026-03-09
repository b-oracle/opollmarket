

## Plan: Disable left-edge swipe navigation on Home and Feed

### Problem
The `html` element has `touch-action: manipulation` (line 112 in `index.css`) which permits horizontal gestures and can override the `body`'s `touch-action: pan-y`. The `#root` element also lacks horizontal overscroll prevention.

### Changes

**`src/index.css`** — Two small fixes:

1. Change `html` `touch-action` from `manipulation` to `pan-y` (line 112) — this ensures the entire document tree only allows vertical touch gestures at the root level
2. Add `overscroll-behavior-x: none` to `#root` (line 134-138) for complete coverage

### What stays unaffected
- **Swipe-to-predict on Feed** — uses custom `touchstart`/`touchmove` handlers with `preventDefault()`, independent of CSS `touch-action`
- **Profile slide-to-reveal** — also uses custom touch handlers, unaffected
- **Input fields** — retain `touch-action: manipulation` via the existing `input, textarea, [contenteditable]` rule

