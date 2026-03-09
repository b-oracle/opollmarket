

## Problem

All 26 user profiles have `verification_level = 'none'` in the database. The column was added but never populated. The `bulk-update-verification` edge function exists and the "Refresh All Verifications" button was added to Admin Settings, but it has never been triggered. Contract addresses for both the NFT and BC400 token are correctly configured in `commission_settings`.

## Root Cause

No code or admin action has ever called the `bulk-update-verification` function to scan wallets and compute badge tiers. The auto-trigger on wallet connect (in `Profile.tsx`) only fires when a user saves their wallet -- existing users who connected wallets before the feature was added were never retroactively checked.

## Plan

### 1. Trigger the bulk verification update now
Run the `bulk-update-verification` edge function to scan all 7 profiles with connected wallets and set their `verification_level` based on current NFT and token holdings. This is a one-time action to populate existing data.

### 2. Fix the UserProfile badge logic (minor)
Line 293 of `UserProfile.tsx` has a fallback to `isNftAvatar` which is unnecessary now. Clean it up to use `verification_level` directly:
```typescript
const verificationLevel = (profile?.verification_level || "none") as VerificationLevel;
```

### 3. Verify the edge function works
After triggering the bulk update, confirm that profiles now have `blue` or `gold` verification levels in the database, which will make badges appear across all pages (UserProfile, Rankings, Followers, SocialSection).

