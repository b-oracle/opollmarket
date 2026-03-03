

## Plan: Replace Like with Bookmark and Persist to Database

### What
Replace the Heart/like icon on the market detail page with a Bookmark icon, and persist bookmarked markets to a database table so favorites survive across sessions.

### Database Changes
Create a new `bookmarks` table:

```sql
CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, market_id)
);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own bookmarks" ON public.bookmarks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks" ON public.bookmarks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks" ON public.bookmarks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

### Code Changes

**`src/pages/MarketDetail.tsx`**:
1. Replace `Heart` import with `Bookmark` from lucide-react
2. Replace the local `liked` state with a database-backed `bookmarked` state
3. On mount, query `bookmarks` table for current user + market combo
4. On click, insert or delete from `bookmarks` table
5. Update the icon to use `Bookmark` with fill when active, show appropriate toast

**`src/hooks/useBookmark.ts`** (new file):
- Custom hook `useBookmark(marketId)` that:
  - Fetches bookmark status on mount (if user is authenticated)
  - Provides `bookmarked` boolean and `toggleBookmark()` function
  - Handles insert/delete with optimistic UI updates
  - Shows toast on toggle

