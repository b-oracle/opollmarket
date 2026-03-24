

# Redirect Shared Space Links to Profile Spaces Tab

## Problem
When a user clicks a shared link for a scheduled space (`/feed?space={id}`), the deep-link handler in `Feed.tsx` navigates to `/feed` (the market feed) after showing the toast. The user expects to land on the Spaces tab instead.

## Solution

### 1. Change navigation target in `Feed.tsx` deep-link handler (~lines 280-311)
- For **scheduled** spaces: navigate to `/profile?tab=spaces` instead of `/feed`, then show the reminder toast
- For **ended** spaces: also navigate to `/profile?tab=spaces`
- For **live** spaces: keep current behavior (joins the space directly)
- Strip the `?space=` param as before

### 2. Handle `?tab=spaces` query param in Profile page (`src/pages/Profile.tsx`)
- On mount, read `searchParams.get("tab")` — if it equals `"spaces"`, scroll to the SocialSection and pre-select the spaces tab

### 3. Accept initial tab prop in `SocialSection.tsx`
- Add an optional `initialTab` prop to `SocialSection`
- Use it to set the default `activeTab` state instead of always defaulting to `"posts"`
- Profile.tsx passes `initialTab="spaces"` when the query param is present

### Files to modify
- `src/pages/Feed.tsx` — change navigate target for scheduled/ended spaces
- `src/pages/Profile.tsx` — read `?tab` param, pass to SocialSection
- `src/components/SocialSection.tsx` — accept `initialTab` prop

