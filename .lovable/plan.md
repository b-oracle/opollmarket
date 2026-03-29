

# Tagged Markets Carousel in Space Header

## Overview
Allow space hosts to tag up to 5 markets to their space. Tagged markets appear as a scrollable carousel/jumbotron between the space header and the speakers section, visible to all participants.

## Changes

### 1. Database: Add `tagged_market_ids` column to `spaces` table
- Migration: `ALTER TABLE public.spaces ADD COLUMN tagged_market_ids UUID[] NOT NULL DEFAULT '{}';`
- No new table needed — a simple array column on spaces suffices for up to 5 IDs.

### 2. Update `CreateSpaceModal` — Add market tagging UI
- **File**: `src/components/social/CreateSpaceModal.tsx`
- Add a "Tag Markets" section below the title input (host-only, shown during creation).
- Fetch active markets via a search-as-you-type input (query `markets` table by title, limit 10).
- Display selected markets as removable chips (max 5). Enforce the limit in UI.
- Save `tagged_market_ids` array in the insert payload.

### 3. Update `SpaceRoom` — Market carousel in header area
- **File**: `src/components/social/SpaceRoom.tsx`
- On mount, fetch the space's `tagged_market_ids`. If non-empty, query `markets` table for those IDs to get title, image, yes_price/options, and category.
- Render a horizontally scrollable carousel between the header (line ~1219) and the content area (line ~1222).
- Each card: compact design (~60px tall) showing market image thumbnail, title (truncated), and current probability. Tapping navigates to `/market/:id`.
- Host gets an "Edit Markets" button (pencil icon) that opens an inline editor to add/remove tagged markets (same search UI as creation modal). Updates are saved via `supabase.from('spaces').update({ tagged_market_ids })`.
- Non-hosts see the carousel read-only.

### 4. Card design
- Horizontal scroll with `snap-x`, cards are ~200px wide with market thumbnail (40x40), title, and probability badge.
- Glass/muted background consistent with SpaceRoom styling.
- Dot indicators if more than 2 markets.

## Technical Details
- Array column keeps it simple — no join table needed for ≤5 items.
- Market data is fetched once on mount and cached in local state (no realtime needed for tagged markets).
- The `tagged_market_ids` column is included in existing RLS policies (host can update own spaces, public can read).

## Files Modified
- **New migration**: adds `tagged_market_ids` column
- `src/components/social/CreateSpaceModal.tsx`: market tagging during creation
- `src/components/social/SpaceRoom.tsx`: carousel display + host edit capability

