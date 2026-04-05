

## Add Market Tagging to Community Chat (Category-Restricted)

### What it does
Users in a community chat can tag markets in their messages, but only markets whose `category` matches the community's category (e.g., the "Crypto" community can only tag Crypto markets).

### How it works

**1. Add `categoryFilter` prop to `MarketTagSelector`**
- File: `src/components/social/MarketTagSelector.tsx`
- Add optional `categoryFilter?: string` prop
- When provided, add `.eq("category", categoryFilter)` to the Supabase query that searches markets
- This restricts search results to only markets in that category

**2. Add market tagging UI to `CommunityChat`**
- File: `src/components/chat/CommunityChat.tsx`
- Add a `TrendingUp` icon button next to the message input (similar to how image upload or other actions work)
- When tapped, show a `MarketTagSelector` panel above the input area, filtered to the community's category
- Map community `slug` → market `category` using the existing `categoryMap` pattern from `CommunitiesTab.tsx`:
  - `crypto` → `Crypto`, `sports` → `Sports`, `politics` → `Politics`, etc.
- Selected markets are stored in local state and sent as part of the message

**3. Store tagged market IDs in community messages**
- The `community_messages` table will need a `tagged_market_ids` text array column (migration)
- When sending a message, include the array of selected market IDs in the insert payload
- After send, clear the selection

**4. Display tagged markets in message bubbles**
- In the message rendering section of `CommunityChat.tsx`, when a message has `tagged_market_ids`, fetch and display small market cards inline below the message text
- Tapping a card navigates to `/market/{id}`
- Reuse the compact card style from `TaggedMarketsCarousel` (thumbnail + title + yes price)

### Database migration
```sql
ALTER TABLE public.community_messages
ADD COLUMN tagged_market_ids text[] DEFAULT '{}';
```

### Files to modify
- `src/components/social/MarketTagSelector.tsx` — add `categoryFilter` prop
- `src/components/chat/CommunityChat.tsx` — add tag button, selector panel, display tagged markets
- Database migration for the new column

