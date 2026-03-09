

## Plan: Block left/right edge swipe navigation with JavaScript

### Problem
CSS `touch-action: pan-y` and `overscroll-behavior-x: none` are already set but don't prevent the browser's native edge-swipe navigation in all contexts (especially within iframes/PWA previews). A JavaScript-level touch event interceptor is needed to catch and cancel horizontal swipes that originate near screen edges.

### Change

**`src/main.tsx`** — Add a global touch event listener that detects touches starting within 30px of the left or right screen edge and calls `preventDefault()` on `touchmove` to block the browser's navigation gesture. This runs at the document level before any component mounts.

```typescript
// Prevent browser edge-swipe navigation
const EDGE_THRESHOLD = 30;
document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  if (touch.clientX < EDGE_THRESHOLD || touch.clientX > window.innerWidth - EDGE_THRESHOLD) {
    const onMove = (ev: TouchEvent) => ev.preventDefault();
    const cleanup = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', cleanup);
      document.removeEventListener('touchcancel', cleanup);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', cleanup);
    document.addEventListener('touchcancel', cleanup);
  }
}, { passive: true });
```

### What stays unaffected
- **Swipe-to-predict on Feed** — touch starts on the MarketCard (center of screen), well outside the 30px edge zone
- **Profile slide-to-reveal** — same reason, touch originates on profile content, not the screen edge
- **Vertical scrolling** — only horizontal edge swipes are blocked

