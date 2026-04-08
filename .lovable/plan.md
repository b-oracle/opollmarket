

## Plan: Fix Twitter Card Images for Shared Market Links

### Problem
When market links are shared on Twitter/X, the preview card shows the default OPoll placeholder instead of the market-specific image and title. This happens because:

1. **Auto-tweets use the wrong URL** — `twitter-post-tweet` posts links like `https://opoll.org/market/{id}`, which is a client-side SPA route. Twitter's crawler gets the default `index.html` meta tags, not market-specific OG tags.
2. **The `og-share` edge function exists** but is only used in `ShareModal.tsx` — not in auto-tweets or the `BetModal` share button.
3. **SVG fallback won't work** — If a market has no `image_url`, the `og-image` function returns SVG, which Twitter doesn't support.

### Solution

**1. Use `og-share` URL in all tweet links**
Update `BetModal.tsx` (`ShareToXButton`) to construct the tweet URL using the `og-share` edge function instead of the direct SPA URL. This ensures Twitter's crawler hits the edge function and receives proper OG meta tags with the correct market image and title.

**2. Convert `og-image` fallback from SVG to PNG**
The `og-image` edge function currently returns SVG. Twitter requires raster images (PNG/JPEG). Convert it to render the SVG to a PNG using the `@vercel/og`-style approach with Satori + resvg-wasm, or simply use a simpler HTML-to-image approach. This handles the case where a market has no uploaded image.

**3. Add `og:image` content type hint**
In `og-share`, add `og:image:type` meta tag so Twitter knows the image format.

### Files to Change

| File | Change |
|------|--------|
| `src/components/BetModal.tsx` | Use `og-share` URL in ShareToXButton tweet text |
| `supabase/functions/og-image/index.ts` | Convert SVG output to PNG using resvg-wasm |
| `supabase/functions/og-share/index.ts` | Add `og:image:type` meta tag |

### Technical Detail

The `og-share` function already fetches `market.image_url` and uses it as the OG image when available. The main fix is routing all shared links through `og-share` so Twitter's crawler gets the right meta tags. The PNG conversion of `og-image` is a secondary improvement for markets without uploaded images.

