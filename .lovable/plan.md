

## Social Ads Feature

A new paid promotion type that injects market advertisements directly into users' status feeds, styled like normal posts but tagged as "Ad" — similar to Facebook/X/Instagram sponsored posts. Supports optional YouTube video ads with autoplay.

---

### Database Changes

**New table: `social_ads`**
- `id` (uuid, PK)
- `market_id` (uuid, FK → markets)
- `user_id` (uuid, FK — the advertiser)
- `headline` (text — custom ad copy, falls back to market title)
- `video_url` (text, nullable — YouTube link for video ads)
- `amount` (numeric — amount paid)
- `status` (text — `pending`, `active`, `expired`, `cancelled`)
- `starts_at` (timestamptz, default now)
- `ends_at` (timestamptz — expiry based on tier/duration)
- `impressions` (int, default 0 — track how many times shown)
- `clicks` (int, default 0 — track clicks)
- `created_at` (timestamptz)

**New column on `commission_settings`:**
- `social_ad_price` (numeric, default 10) — configurable price per ad

RLS: Authenticated users can insert their own ads; select is open for active ads to render in feeds.

---

### Backend: Payment via `pay-promotion-balance`

Extend the existing `pay-promotion-balance` edge function to accept a new `include_social_ad` boolean + optional `ad_headline` and `ad_video_url` params. When set, it creates a `social_ads` record after debiting the user's balance, similar to how broadcast is handled today.

---

### Frontend Changes

**1. BoostMarketModal — Add "Social Ad" option**
- Add a new selectable card alongside "Broadcast Alert" in the promotion picker
- Shows price, description ("Your market appears as a sponsored post in everyone's feed")
- Optional text input for custom headline
- Optional text input for YouTube video URL
- Included in total price calculation and sent to `pay-promotion-balance`

**2. StatusFeed — Inject ads into the feed**
- Fetch active `social_ads` (status = 'active', ends_at > now)
- Insert one ad every ~5 posts in the feed (position 3, 8, 13, etc.)
- Each ad renders as a `StatusCard`-like component with:
  - "Ad" / "Sponsored" badge (small pill tag)
  - Market preview card (image, title, yes/no prices) — clickable → `/market/:id`
  - If `video_url` is a YouTube link, render `YouTubeEmbed` with autoplay+mute+loop
  - Custom headline text if provided
  - No like/comment/repoll actions (or minimal — just a "Learn more" CTA)
- Increment `impressions` count on render (fire-and-forget update)
- Increment `clicks` count on click-through

**3. New `SocialAdCard` component**
- Renders the ad unit with the "Sponsored" tag, market info, optional YouTube embed
- Uses existing `YouTubeEmbed` component for video ads
- Visual styling matches `StatusCard` but with a subtle promoted indicator

---

### Technical Details

- **Table migration**: Create `social_ads` table + add `social_ad_price` column to `commission_settings`
- **Edge function edit**: `pay-promotion-balance/index.ts` — add social ad creation block after broadcast block
- **New component**: `src/components/social/SocialAdCard.tsx`
- **Edit**: `src/components/social/StatusFeed.tsx` — fetch ads, inject into feed items
- **Edit**: `src/components/BoostMarketModal.tsx` — add social ad selection UI + inputs
- **Impression/click tracking**: Simple upsert calls from the client (no RPC needed)

