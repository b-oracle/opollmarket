

## Plan: Match Market Detail Share Screenshot to Market Card Style

Currently, the Market Detail page captures its existing banner + chart as the share screenshot. The Market Card has a dedicated hidden overlay (`captureContentRef`) with a full-bleed background image, probability ring, category badge, and bottom text overlay — which looks much more polished.

### Changes

**`src/pages/MarketDetail.tsx`**

1. **Add a hidden capture overlay div** (similar to MarketCard's `captureContentRef`) placed inside `shareRef`, styled with `absolute inset-0` and containing:
   - Full background image (low opacity) with gradient overlay
   - Probability ring (SVG circle) in top-right for binary markets, or multi-option indicator
   - Category badge in top-left
   - Bottom gradient overlay with title, description, YES/NO badges, time remaining + timestamp

2. **Remove the chart from the `shareRef` scope** — the screenshot will now be a self-contained card-style overlay matching MarketCard, not a capture of the live page content.

3. **Give the `shareRef` div a fixed aspect ratio** (e.g., `aspect-video`) so the screenshot has consistent dimensions regardless of page layout.

The overlay will reuse the exact same markup structure from MarketCard lines 165-234, adapted with the detail page's variables (`market`, `yesPercent`, `noPercent`, `isMulti`, etc.) which already exist in scope.

### Result
Both the feed card and detail page share buttons will produce visually identical screenshot styles — a branded card with background image, probability indicator, badges, and timestamp.

