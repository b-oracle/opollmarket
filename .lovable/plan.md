

## Plan: Show profile-specific followers/following lists

**Problem:** Clicking "Followers" or "Following" on any user's profile navigates to `/followers`, which always loads the *current logged-in user's* followers/following. It should show the viewed profile's connections instead.

### Changes

**1. `src/App.tsx`** — Add a route with userId parameter:
- Add route: `/followers/:userId` alongside the existing `/followers` route

**2. `src/pages/Followers.tsx`** — Accept and use the route param:
- Read `userId` from `useParams()` and fall back to `user?.id`
- Use this `userId` in both the followers and following queries instead of hardcoded `user.id`
- Remove the auth redirect when viewing another user's followers (only require auth for own page)

**3. `src/pages/UserProfile.tsx`** (lines 388-394) — Pass the profile's userId in navigation:
- Change `navigate('/followers')` → `navigate('/followers/${profileUserId}')` for both the Followers and Following stat clicks

This way, clicking followers/following on *any* profile loads that user's connections list, and clicking on your own profile still works as before.

