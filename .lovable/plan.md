

## Adaptive Image Fitting for Market Feeds and Social Status Cards

### Problem
Images use `object-cover` everywhere, which crops aggressively — especially on tall or narrow images. This causes important content to be cut off. The user wants images to adapt naturally to their containers.

### Solution
Use `object-contain` with a background fill so images fit fully within containers without cropping, while avoiding empty whitespace gaps.

### Changes

**1. Market Card background image (`MarketCard.tsx`)**
- Keep `object-cover` here — this is a decorative background behind text with a gradient overlay, not a content image. Over-cropping is less of an issue since it's at 40% opacity.
- Reduce parallax bleed from `-8px` to `-4px` to minimize zoom further.

**2. Social Status Card — post images (`StatusCard.tsx`, line ~357)**
- Change from `object-cover` to a hybrid approach: wrap the image in a container with `bg-muted/30` background, use `object-contain` so the full image is always visible, and set `max-h-96` with `w-full` to cap height.
- Before: `<img ... className="w-full max-h-96 object-cover rounded-lg" />`
- After: `<img ... className="w-full max-h-96 object-contain rounded-lg" />`
- The parent `bg-muted/20` already provides a subtle background for any letterboxing.

**3. Social Status Card — market thumbnail (`StatusCard.tsx`, line ~332)**
- Change the small market preview thumbnail from `object-cover` to `object-contain` with a muted background, so market thumbnails aren't cropped.
- Before: `className="w-12 h-12 rounded object-cover shrink-0"`
- After: `className="w-12 h-12 rounded object-contain bg-muted/30 shrink-0"`

**4. Social Ad Card — market thumbnail (`SocialAdCard.tsx`)**
- Same change as above for the ad card's market thumbnail.

**5. Image compression presets (`optimizedImage.ts`)**
- No changes needed — the server-side transforms are fine. The issue is purely CSS fitting behavior.

### Summary of file changes
| File | Change |
|------|--------|
| `src/components/MarketCard.tsx` | Reduce parallax bleed to -4px |
| `src/components/social/StatusCard.tsx` | Post images → `object-contain`; market thumb → `object-contain` with bg |
| `src/components/social/SocialAdCard.tsx` | Market thumb → `object-contain` with bg |

