

## Fix: Vertical Scroll on Android/Chrome for Social Profile Pages

**Problem**: On Android Chrome, the global `touch-action: pan-y` on `html`/`body` combined with the edge-swipe interceptor in `main.tsx` can cause scroll locking on pages that don't establish their own composited scroll layer. The `SocialPage.tsx` slide-out panel already has the fix — but `UserProfile.tsx`, `Profile.tsx`, and `Followers.tsx` do not.

**Solution**: Apply the same isolated scroll container pattern (already proven in `SocialPage.tsx`) to all three affected pages by adding inline styles to their root scrollable `<div>`:

```css
touch-action: pan-y;
overscroll-behavior: contain;
-webkit-overflow-scrolling: touch;
will-change: scroll-position;
```

### Files to edit

1. **`src/pages/UserProfile.tsx`** (~line 355)
   - Add inline `style` properties: `touchAction: "pan-y"`, `WebkitOverflowScrolling: "touch"`, `willChange: "scroll-position"` to the `containerRef` div (merge with existing `paddingBottom` style).

2. **`src/pages/Profile.tsx`** (~line 588)
   - Same treatment on the root `<div>` — add `touchAction`, `WebkitOverflowScrolling`, `overscrollBehavior`, `willChange` to the existing style object. Also add `overflow-y-auto` to className (currently missing).

3. **`src/pages/Followers.tsx`** (~line 131)
   - Same treatment on the `containerRef` div — add the scroll isolation styles inline.

All three changes follow the exact same pattern already used in `SocialPage.tsx` lines 210-216.

