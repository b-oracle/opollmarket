

## Plan: Stories — Followers-only visibility, Delete, and Market attachment

### What changes

**1. Database: Add `market_id` column to stories table**
- Add nullable `market_id` (UUID, references markets) to the `stories` table so users can attach a market to their story.

**2. Stories visibility — followers/following only (StoriesCarousel.tsx)**
- Currently fetches ALL active stories globally. Change to:
  - Fetch the user's follow connections (from `follows` table — where user is `follower_id` OR `following_id`)
  - Filter stories to only show from: the user themselves + users they follow + users who follow them (mutual visibility like WhatsApp/Instagram)
  - For logged-out users, show nothing (stories are a social feature)

**3. Delete own story (StoryViewer.tsx)**
- When viewing your own story, show a **trash/delete button** in the header
- On delete: remove the story row from DB, delete the image from storage if present, invalidate queries, advance to next story or close viewer
- Confirmation dialog before deleting

**4. Add market to story (StoryCreator.tsx)**
- Add a "Link Market" button in the controls section (alongside Add Image)
- Opens a simple market search/picker: search markets by title, select one
- Selected market shown as a card preview overlaid on the story preview
- Store `market_id` in the stories insert

**5. Display market in story (StoryViewer.tsx)**
- When a story has a `market_id`, fetch market details (title, image, yes/no prices)
- Show a tappable market card at the bottom of the story that navigates to the market detail page

### Files to modify
- **Migration SQL**: Add `market_id` column to `stories`
- **StoriesCarousel.tsx**: Filter stories by follow connections
- **StoryViewer.tsx**: Add delete button for own stories; render market card overlay
- **StoryCreator.tsx**: Add market picker UI and pass `market_id` on insert

### Technical details
- Follow connections query: `SELECT follower_id, following_id FROM follows WHERE follower_id = uid OR following_id = uid` — extract the set of connected user IDs, then filter stories to `user_id IN (connectedIds + own id)`
- Delete: `supabase.from("stories").delete().eq("id", storyId).eq("user_id", userId)` — the `.eq("user_id")` ensures only own stories can be deleted
- Market picker: reuse existing markets query, simple text search with `ilike`, show top 5 results
- Market card on story: small floating card at bottom with market title + prices, tapping opens `/market/:id`

