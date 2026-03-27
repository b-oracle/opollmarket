

# Fix: Scroll to Top on Market Creation Step Change

## Problem
When the creator advances between steps (1→2, 2→3, or navigates back), the page retains its scroll position, leaving the user at the bottom of the new step content.

## Solution
Add a `useEffect` that watches the `step` state and scrolls to the top whenever it changes.

## Changes

### `src/pages/Create.tsx`
Add a single `useEffect` after the existing step state declaration (~line 321):

```ts
useEffect(() => {
  window.scrollTo({ top: 0, behavior: "instant" });
}, [step]);
```

This covers all transitions: Next buttons (`setStep(2)`, `setStep(3)`) and Back buttons (`setStep(1)`, `setStep(2)`).

## Files Modified
- `src/pages/Create.tsx` — add scroll-to-top effect on step change

