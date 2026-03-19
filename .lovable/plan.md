

## Plan: Add Market Linking to Status Composer (Replace Image Upload)

### Overview
Replace the image upload button in StatusComposer with a market search picker. Users can still post text-only, but instead of uploading images, they can optionally link a platform market. The image upload button is hidden behind a new `status_image_upload` feature toggle (disabled by default).

### Database Changes

1. **Add `market_id` column** to `status_updates` — nullable UUID, FK to `markets.id ON DELETE SET NULL`
2. **Insert feature toggle** row: `status_image_upload`, label "Status Image Upload", `enabled = false`

### StatusComposer Changes (`src/components/social/StatusComposer.tsx`)

- Add market search picker (same debounced `.ilike()` pattern from StoryCreator: search `markets` table, filtered to active/ended, limit 5)
- Replace the image upload button with a "Link Market" button (chart icon). Tapping opens an inline search input
- When a market is selected, show a mini preview (image, title, yes/no prices) with a remove button
- On submit: include `market_id` in the insert payload; auto-set `image_url` from the market's image if no custom image
- Image upload button only visible when `isFeatureEnabled('status_image_upload')` is true
- Post button remains enabled for text-only posts (no market required)

### StatusCard Changes (`src/components/social/StatusCard.tsx`)

- When `status.market_id` is present, render a tappable market preview card (image, title, yes/no prices) that navigates to `/market/:id`
- Old posts without `market_id` continue rendering normally with existing `image_url` display

### StatusFeed Changes (`src/components/social/StatusFeed.tsx`)

- Fetch market data for statuses that have a `market_id` — batch-fetch from `markets` table using the unique market IDs, pass to StatusCard

### Technical Notes

- `status_updates.content` is `NOT NULL`, so text-only posts work as-is (empty string not allowed, but trimmed text is)
- Market search reuses exact same pattern as StoryCreator lines 72-84
- Feature toggle check uses existing `useFeatureToggles` hook — admins/super_admins bypass it automatically
- Backward compatible: existing posts without `market_id` render unchanged

