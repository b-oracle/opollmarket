

## Plan: Add Haptic Feedback on Pull-to-Refresh

### What
Trigger a short vibration when the user pulls past the refresh threshold, giving tactile confirmation before they release.

### How

**`src/pages/Feed.tsx`** — Two changes:

1. **Track if haptic already fired** with a `useRef<boolean>` (`hapticFired`) to avoid repeated vibrations during a single pull gesture.

2. **In `handleTouchMove`**: When `dampened >= PULL_THRESHOLD` and `hapticFired` is false, call `navigator.vibrate?.(15)` (15ms short pulse) and set `hapticFired = true`.

3. **In `handleTouchEnd`**: Reset `hapticFired.current = false`.

One file modified, minimal change.

