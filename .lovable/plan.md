

# Restrict Space Hosting & Co-hosting to Verified Users

## Problem
Any authenticated user can currently host a Space or be made a co-host. Only verified members (blue or gold tick) should be allowed.

## Changes

### 1. CreateSpaceModal — Block unverified users from hosting
**File**: `src/components/social/CreateSpaceModal.tsx`

- Fetch the current user's `verification_level` from profiles on mount
- If `verification_level` is `"none"`, disable the create button and show a message like "Only verified members can host Spaces"
- Alternatively, show a toast and return early in `handleCreate` if unverified

### 2. SpaceRoom — Block unverified users from being made co-host
**File**: `src/components/social/SpaceRoom.tsx`

- In the `invokeAction` handler, when `action === "make_cohost"`, check the target user's `verification_level` from the already-loaded `profiles` state
- If the target's `verification_level` is `"none"`, show a toast error ("Only verified members can be co-hosts") and return early — don't call the edge function

### 3. Edge function — Server-side guard
**File**: `supabase/functions/livekit-token/index.ts`

- In the "make_cohost" action block, query the target user's `verification_level` from profiles
- If `"none"`, return an error response: `{ error: "Only verified members can be co-hosts" }`
- In the default JOIN section, when the user would be the host (creating/starting), optionally also validate host verification (the insert RLS on `spaces` table already requires `auth.uid() = host_id`, but the edge function can add a verification check)

### Technical Details
- Verification levels are: `"none"`, `"blue"`, `"gold"` — stored in `profiles.verification_level`
- Client-side checks provide UX feedback; server-side checks in the edge function prevent bypassing
- The `profiles` map in SpaceRoom already contains `verification_level` for all participants, so no extra queries needed on the client for co-host checks
- For CreateSpaceModal, a single query to fetch the user's own profile verification level is needed

