

## Plan: Add Market Image to Market Detail Page

**What**: Display the market's image prominently at the top of the market detail page, between the top bar and the title.

**How**: In `src/pages/MarketDetail.tsx`, add an image banner after the sticky header (line 279) and before the title section. The image will use `market.imageUrl` with a gradient overlay fading into the background, creating a hero-style banner.

**Changes** (single file: `src/pages/MarketDetail.tsx`):

1. After the sticky top bar (`</div>` at line 279), insert a full-width hero image:
   - Render `market.imageUrl` as an `<img>` inside a container with `aspect-video` or fixed height (~200px)
   - Add a bottom gradient overlay (`bg-gradient-to-t from-background`) so the title blends smoothly beneath
   - Only render the image block if `market.imageUrl` is truthy
   - Use `object-cover` for proper image scaling

2. Adjust the title section spacing — reduce `pt-4` to `pt-2` when an image is present to avoid excessive gap.

