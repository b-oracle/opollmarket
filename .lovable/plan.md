

## Plan: Add Title & Description Overlay to Feed Share Screenshot

### Problem
The `captureContentRef` in `MarketCard.tsx` currently wraps only the background image and boost gradient — no text. So the share screenshot shows a faded background with a watermark but no market title or description.

### Changes

**`src/components/MarketCard.tsx`** (single file)

Inside the `captureContentRef` div (line 165), add a positioned overlay with:
- The market **title** (bold, prominent)
- The market **description** (smaller, muted, 2-line clamp)
- Positioned at the bottom of the capturable area with a dark gradient behind the text for readability against the background image

The watermark logo is already drawn by `ShareModal.tsx` — no changes needed there.

```text
captureContentRef div
├── Background image (existing)
├── Gradient overlay (existing)
├── Boost overlay (existing)
└── NEW: Text overlay at bottom
    ├── Title (text-xl font-bold)
    └── Description (text-sm, line-clamp-2)
```

This ensures when `html2canvas` captures this div, the screenshot contains the banner image + title + description + watermark logo.

