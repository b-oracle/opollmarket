

## Plan: Center Title & Description on Banner

### Changes in `src/pages/MarketDetail.tsx`

1. **Line 308-309**: Change the gradient overlay and title positioning to center content vertically and horizontally instead of bottom-left:
   - Update the gradient to a uniform dark overlay for readability
   - Replace the `bottom-4 left-4` positioned `h1` with a centered flex container holding both the title and description

2. **Line 315**: Remove the separate description below the banner (move it into the overlay)

The overlay will use `absolute inset-0 flex flex-col items-center justify-center text-center` with the gradient behind it, placing both title and description centered on the banner.

