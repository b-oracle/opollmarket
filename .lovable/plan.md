

## Plan: Fix ShareModal scrollability on Feed and Market Detail

### Problem
The `ShareModal` screenshot preview image (`<img>`) has no height constraint. On mobile, a tall captured screenshot fills the entire modal, pushing the action buttons and close button out of view. Even though the content area has `overflow-y-auto`, the image expands beyond the viewport before scrolling kicks in effectively.

### Root Cause
Both Feed (via `MarketCard`) and Market Detail use the same `ShareModal` component. The issue is in `ShareModal.tsx` itself — the preview image at line 243 uses `className="w-full object-contain"` with no `max-height`, so a tall screenshot dominates the modal.

### Fix — Single file change

**File: `src/components/ShareModal.tsx`** (line 243)

Add a `max-h-[40vh]` constraint to the screenshot preview image so it never consumes more than 40% of the viewport height, ensuring the header (with close button), sales message, and action buttons all remain reachable via scroll:

```tsx
// Before
<img src={screenshot} alt="Preview" className="w-full object-contain" />

// After
<img src={screenshot} alt="Preview" className="w-full object-contain max-h-[40vh]" />
```

This is a one-line change in the shared `ShareModal` component that fixes the issue for all consumers: Feed market cards, Market Detail, Profile share, Win celebration, and any future usage.

