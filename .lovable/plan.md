

## Problem

The `/user/:id` route always treats the URL parameter as a UUID and queries `profiles.id = :id`. When a non-UUID value (like a username) is passed, the query fails, causing "Profile not found." Additionally, sharing long UUID-based URLs is unfriendly.

## Plan

### 1. Support both UUID and username in UserProfile

Modify `src/pages/UserProfile.tsx` to detect whether the `:id` param is a UUID or a username:
- If it matches UUID format → query by `id` (current behavior)
- Otherwise → query by `username` (case-insensitive)

Once the profile is resolved, use the profile's `id` for all subsequent queries (markets, positions, follows, etc.).

### 2. Add a `/user/:username` friendly alias

No route changes needed — the existing `/user/:id` route already captures any string. The only change is in the UserProfile component's query logic.

### 3. Update internal navigation links

Update components that link to user profiles (SocialPage `renderUserRow`, chat, followers, etc.) to use `username` instead of UUID when available:
- `src/components/SocialPage.tsx` — `renderUserRow` onClick
- `src/pages/UserProfile.tsx` — share URL generation
- Other profile links can be updated incrementally

### Technical Details

**UserProfile.tsx query change:**
```typescript
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-.*/.test(id);
const query = isUUID
  ? supabase.from("profiles").select("...").eq("id", id)
  : supabase.from("profiles").select("...").eq("username", id.toLowerCase());
```

After resolving the profile, store the actual `profile.id` in state and use it for all downstream queries (markets, positions, follow counts, etc.).

**Files to modify:**
- `src/pages/UserProfile.tsx` — main logic change
- `src/components/SocialPage.tsx` — use username in navigation links
- Any share URL generation — use username for cleaner links

