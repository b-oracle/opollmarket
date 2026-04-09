

## Plan: Navigate Messages back button to user's social status page

### Problem
The back button on the Messages page currently navigates to `/profile` (the settings/wallet profile page). The user wants it to go to their social status page at `/user/{username}` instead.

### Change

**File: `src/components/chat/ConversationList.tsx`** (line 282)

Update the back button's `onClick` handler to navigate to the user's social page using their username (falling back to their user ID):

```typescript
// Before
navigate("/profile")

// After  
navigate(`/user/${profile?.username || user?.id}`)
```

This requires accessing the user's profile data (specifically the `username` field). The component already has the `user` object from `useAuth()`, so we'll add a quick profile query or use the username from the profile if already available.

### Details
- Fetch the user's `username` from the `profiles` table (a lightweight single-field query)
- Navigate to `/user/{username}` if available, otherwise fall back to `/user/{userId}`
- This matches the same destination as the "My Social" button on the Profile page

