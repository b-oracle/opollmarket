

## Plan: Fix Share Image Rendering and Twitter OG Preview

### Problem 1: Incomplete html2canvas rendering
The hidden capture div sometimes fails to render fully because:
- Cross-origin market images may not load before capture starts
- CSS variables (`var(--muted)`, `var(--neon-yes)`) aren't resolved by html2canvas
- The `glass` utility class uses backdrop-blur which html2canvas doesn't support
- Only a 500ms delay before capture — not enough for image loading

### Problem 2: Twitter shows default OG image instead of market image
The Twitter share button links to `opoll.org/market/{id}` — a client-side SPA. Twitter's crawler can't execute JavaScript, so it reads the static `index.html` OG tags (default image). The `og-share` edge function already generates correct OG tags for crawlers but **isn't used** in the share URL.

---

### Fix 1: Pre-load the market image before capture

**`src/components/ShareModal.tsx`**
- Before calling `html2canvas`, pre-load the market image as a base64 data URL using a canvas element (avoids CORS issues)
- Add a retry mechanism: if first capture produces a mostly-blank canvas, wait and retry once
- Increase the initial delay from 500ms to 800ms

### Fix 2: Inline CSS variable values in capture divs

**`src/components/MarketCard.tsx`** and **`src/pages/MarketDetail.tsx`**
- In the hidden capture div, replace CSS variable references with hardcoded color values (e.g., `hsl(var(--neon-yes))` → `#22c55e`)
- Replace `glass` class with inline styles (`background: rgba(0,0,0,0.5)`)
- This only affects the hidden capture element, not the visible UI

### Fix 3: Route Twitter share URLs through og-share

**`src/components/ShareModal.tsx`**
- Change the Twitter share handler to use the og-share edge function URL instead of the direct `opoll.org` URL
- Twitter link becomes: `https://{supabase_url}/functions/v1/og-share?id={marketId}&ref={userId}`
- This serves proper OG tags to Twitter's crawler, then redirects real users to the app
- Keep other platforms (WhatsApp, Telegram, Facebook) using the same og-share URL since they also benefit from dynamic OG tags

### Fix 4: Add image pre-loading with timeout fallback

**`src/components/ShareModal.tsx`**
- In `captureElement`, add logic to wait for all `<img>` elements inside the target to finish loading (with a 3s timeout)
- If capture still fails or produces a blank result, fall back to the market's `image_url` directly

### Technical details

- The og-share function already handles crawler detection, serves OG HTML to bots, and 302-redirects real users — no backend changes needed
- The SUPABASE_URL is available via `import.meta.env.VITE_SUPABASE_URL`
- Hardcoded colors in capture div: `--neon-yes` = `#22c55e`, `--muted` = `#27272a` (dark) / `#e5e5e5` (light), `--background` = `#0a0a0a` (dark) / `#ffffff` (light)
- Files changed: `ShareModal.tsx`, `MarketCard.tsx`, `MarketDetail.tsx`

