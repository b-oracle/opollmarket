

## Plan: Improve voice input active state icon

Replace the `MicOff` icon (shown when recording) with a red pulsing `Mic` icon to clearly indicate voice input is active, rather than suggesting it's cancelled.

### Changes

**1. `src/pages/Create.tsx`**
- When `isListening` is true, render `<Mic>` with red color and a pulsing animation (`animate-pulse`) instead of `<MicOff>`

**2. `src/pages/admin/AdminCreateMarket.tsx`**
- Same change: replace `MicOff` with a red pulsing `Mic` icon when listening

Both files keep `MicOff` import removed (or unused) and use only `Mic` with conditional styling: `className={isListening ? "text-red-500 animate-pulse" : ""}`.

