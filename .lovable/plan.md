

## Plan: Center LogoLoader vertically on screen

The `PageFallback` component in `App.tsx` uses `min-h-[60vh]` which doesn't account for the top bar and bottom nav, causing the loader to appear stuck near the top rather than visually centered on the available screen area.

### Change

**`src/App.tsx`** — Update `PageFallback` to use `min-h-screen` with proper padding offsets for the top bar and bottom nav so the loader sits in the true visual center:

```tsx
const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))]">
    <LogoLoader />
  </div>
);
```

This uses the same safe-area-aware padding pattern already used across the app's pages, ensuring the spinner is centered between the top bar and bottom nav on all devices.

