

## Problem Analysis

Badges disappeared because of two issues:

1. **Database `verification_level` defaults to `'none'`** — The new column was added but never populated for existing users. The `update-verification` edge function must be called per-user to set their level, but no bulk run or automatic trigger exists yet.

2. **SocialSection still uses old `isNftAvatar` check** — The followers/following/suggestions lists in `SocialSection.tsx` (line 89, 107) check avatar URL instead of `verification_level`, and the profile queries (lines 37, 55, 79) don't fetch `verification_level` at all.

## Plan

### 1. Fix SocialSection to use `verification_level`
- Update profile queries (lines 37, 55, 79) to include `verification_level` in the select
- Replace `isNftAvatar` check in `renderUserRow` with `prof?.verification_level` to render the correct badge tier

### 2. Add bulk verification update mechanism
- Create a new admin-callable edge function `bulk-update-verification` that iterates all profiles with a `wallet_address`, calls the existing NFT and token checks, and updates `verification_level` for each
- Add a "Refresh All Verifications" button in `AdminSettings.tsx` under the Verified Member Benefits card so the super admin can trigger a bulk re-check

### 3. Auto-trigger verification on wallet connect
- In the profile update flow (where `wallet_address` is saved), automatically invoke the `update-verification` function so users get their badge as soon as they connect a wallet — no manual admin action needed for new connections

### Technical Details

**SocialSection.tsx** — profile selects change from:
```
.select("id, display_name, avatar_url, bio")
```
to:
```
.select("id, display_name, avatar_url, bio, verification_level")
```

`renderUserRow` replaces `isNftAvatar(prof?.avatar_url)` with reading `prof?.verification_level` and passing `level` prop to `NftBadge`.

**bulk-update-verification** edge function — admin-only (service role), loops through profiles with wallet addresses, runs the same NFT + token checks as `update-verification`, batch-updates results.

**Profile wallet save** — after saving `wallet_address` to profile, call `supabase.functions.invoke("update-verification")` to immediately compute the badge.

