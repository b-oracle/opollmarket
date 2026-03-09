

## Plan: Prevent right-edge drag navigation on Home and Feed screens

### What's happening

The "drag from right edge" behavior on the Home and Feed screens is the **native browser/PWA swipe-to-navigate** gesture (iOS Safari's back/forward swipe). There is no custom code for this on those pages — unlike Profile.tsx which has an intentional slide-to-reveal gesture.

### Changes

**1. `src/index.css` — Add global overscroll prevention**

Add `overscroll-behavior-x: none` to the `html` and `body` elements to prevent the browser's native horizontal swipe-to-navigate gesture across the entire app. This is the standard way to disable iOS Safari's edge-swipe navigation in PWAs/web apps.

```css
html, body {
  overscroll-behavior-x: none;
}
```

**2. `src/pages/Index.tsx` — Add `touch-action: pan-y` to main container**

Set `touchAction: "pan-y"` on the scrollable container so the browser only allows vertical scrolling, blocking horizontal swipe interpretation.

**3. `src/pages/Feed.tsx` — Ensure `touch-action: pan-y` on feed container**

The feed container already uses `touchAction: "pan-y"` on MarketCard level. We'll also add it to the feed's scroll container to be safe. This will NOT affect the MarketCard's swipe-to-predict since that gesture uses its own `touchstart`/`touchmove` listeners with `preventDefault()`.

### What stays untouched
- **MarketCard swipe-to-predict** — uses custom touch handlers with `preventDefault()`, independent of `touch-action`
- **Feed pull-to-refresh** — vertical gesture, unaffected by `overscroll-behavior-x`
- **Profile slide-to-reveal** — not in scope (only Home and Feed requested)

