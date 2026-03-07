

## Plan: Replace Logo for Desktop, Footer, and Light-Mode Watermark

### Summary
Copy the new blue logo (`blue_opoll.png`) into `src/assets/` and use it in place of the current `logo.png` for desktop sidebar, desktop footer, and as the watermark in light mode. The favicon and LogoLoader remain unchanged (they use `/logo.png` and `/public/logo.png`).

### Changes

**1. Copy the uploaded logo**
- Copy `user-uploads://blue_opoll.png` to `src/assets/blue-opoll-logo.png`

**2. `src/components/DesktopSidebar.tsx`**
- Import the new logo: `import logo from "@/assets/blue-opoll-logo.png"`
- Replace the existing `logo.png` import — the sidebar logo and "Poll" text will now use the new blue logo

**3. `src/components/DesktopFooter.tsx`**
- Import the new logo: `import logo from "@/assets/blue-opoll-logo.png"`
- Replace the existing `logo.png` import

**4. `src/components/TopBar.tsx`**
- Import the new logo: `import logo from "@/assets/blue-opoll-logo.png"` (TopBar shows on desktop too)
- Replace the existing `logo.png` import

**5. Light-mode watermark — update watermark references to be theme-aware**

For the watermark files (`MarketCard.tsx`, `MarketDetail.tsx`, `QuickTrade.tsx`, `ShareModal.tsx`, `RankShareModal.tsx`):
- Import both `watermarkLogo` (existing dark-mode) and the new `blueLogo` from `@/assets/blue-opoll-logo.png`
- Use `next-themes` `useTheme()` (or check `document.documentElement.classList.contains('dark')`) to pick the correct watermark at render time
- In light mode → use `blue-opoll-logo.png`; in dark mode → keep existing `watermark-logo.png`

For canvas-based watermarks (ShareModal, RankShareModal), detect theme and swap the image source accordingly.

### What stays the same
- `/public/logo.png` (favicon, PWA icons) — unchanged
- `src/components/LogoLoader.tsx` — uses `/logo.png`, unchanged
- `src/assets/logo.png` — kept for mobile TopBar if needed

