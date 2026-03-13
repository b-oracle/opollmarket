

## Plan: Replace Watermark & Footer Logos with New Brand Assets

### What's Changing
Replace the two watermark logo assets with the newly uploaded versions, and update the footer to use theme-aware logos (currently it only uses the generic icon).

### Asset Mapping
- **`src/assets/watermark-logo.png`** → replaced with `IMG_0475.png` (white logo, used in dark mode)
- **`src/assets/blue-opoll-logo.png`** → replaced with `IMG_0476.png` (blue logo, used in light mode)

### File Changes

**1. Copy new assets** (2 files)
- Copy `IMG_0475.png` → `src/assets/watermark-logo.png`
- Copy `IMG_0476.png` → `src/assets/blue-opoll-logo.png`

**2. Update `src/components/DesktopFooter.tsx`**
- Import both logo assets (`watermark-logo.png` and `blue-opoll-logo.png`)
- Replace the single `<img src={logo}>` in the footer brand section with two theme-aware images:
  - White logo visible in light mode (`dark:hidden`)
  - Blue logo visible in dark mode (`hidden dark:block`)
- Remove the "Poll" text span since the new logos include the full wordmark

### No Changes Needed
- **Header** — kept as-is per your instruction
- **All watermark references** in `MarketCard`, `MarketDetail`, `QuickTrade`, `ShareModal`, `RankShareModal`, `ProfileShareCard`, `ProfitShareCard` — these already import from the same asset paths, so replacing the files automatically updates them all

