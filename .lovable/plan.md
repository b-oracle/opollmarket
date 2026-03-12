

## Problem
The `SocialSection.tsx` component (displayed on user profile pages) has a "For You" tab but lacks the search bar that exists in the standalone `SocialPage.tsx`. The user wants to search for friends directly from this tab.

## Plan

### Changes: `src/components/SocialSection.tsx`

1. **Add search state and debounce logic** -- Import `Input`, `Search`, `X` icons, add `searchQuery` and `debouncedSearch` state with a debounced handler (matching the pattern in `SocialPage.tsx`).

2. **Add search query** -- Add a `useQuery` for searching profiles by display name when `debouncedSearch.length >= 2`, querying `profiles` table with `ilike` filter.

3. **Add search bar UI** in the `activeTab === "suggestions"` block -- Place a search input with clear button above the suggestions list (before the "Active traders..." text).

4. **Conditionally render search results vs suggestions** -- When searching (2+ chars), show search results; otherwise show the existing suggestion list as-is.

