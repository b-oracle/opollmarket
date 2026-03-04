

## Problem

1. **Pinch-zoom and swipe-around**: Users can pinch-zoom and drag the viewport on mobile, breaking the native app feel.
2. **Top bar overlaps status bar**: The header's logo and Sign In button sit too high, clashing with the phone's time/battery indicators (safe area not respected).

## Plan

### 1. Lock down viewport interactions (prevent zoom/scroll bounce)

**`index.html`** — viewport meta already has `maximum-scale=1.0, user-scalable=no`. Add CSS-level protection:

**`src/index.css`** — Add to the `body` rule:
- `touch-action: pan-y` (allow vertical scroll only, block pinch-zoom)
- `overscroll-behavior: none` (prevent pull-to-refresh / rubber-banding)
- `-webkit-user-select: none; user-select: none` on the html/body level to prevent text-selection drag issues
- `overflow: hidden` on `html` element, `overflow-y: auto` on `body`/`#root`

Also add a global rule:
```css
html {
  overflow: hidden;
  height: 100%;
  touch-action: manipulation;
}
body {
  overflow-y: auto;
  height: 100%;
  overscroll-behavior: none;
}
```

### 2. Fix TopBar safe area spacing

**`src/components/TopBar.tsx`** — The header is `fixed top-0` but doesn't account for `safe-area-inset-top` (the notch/dynamic island area).

- Add `padding-top: env(safe-area-inset-top)` to the `<header>` element via inline style (same pattern already used on BottomNav for bottom inset).
- This pushes the logo and Sign In button below the status bar.

### Files to modify
- `src/index.css` — Add zoom/scroll lock styles
- `src/components/TopBar.tsx` — Add safe-area top padding
- `src/App.css` — Remove the `#root` padding/margin that could interfere

