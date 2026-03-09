

## Problem

Currently, verification checks only whether the user **holds** an NFT in their wallet. The user wants the blue tick to also require that the NFT is **set as the user's avatar** — not just held in the wallet.

The `isNftAvatar` helper already exists: it returns `true` when `avatar_url` does NOT contain `/storage/v1/` (meaning it's an external NFT image, not an uploaded file).

## Plan

### 1. Update `update-verification` edge function
- Fetch `avatar_url` alongside `wallet_address` from the profile
- Add an `isNftAvatar` check: `avatar_url` must exist and not contain `/storage/v1/`
- Change `hasNft` logic: user must both **hold** the NFT in wallet AND **use** it as avatar
- Verification tiers remain: `gold` = NFT avatar + tokens, `blue` = NFT avatar OR tokens, `none` = neither

### 2. Update `bulk-update-verification` edge function
- Same change: fetch `avatar_url` for each profile
- Add the `isNftAvatar` check to the NFT validation logic
- Only grant NFT-based verification if the user is actively using the NFT as their avatar

### 3. No frontend changes needed
The frontend already reads `verification_level` from the database. The logic change is entirely server-side.

### Technical Detail

In both edge functions, after fetching the profile, add:
```typescript
const usingNftAvatar = !!profile.avatar_url && !profile.avatar_url.includes("/storage/v1/");
```
Then change the NFT condition from `hasNft` to `hasNft && usingNftAvatar` when computing the level.

