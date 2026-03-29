

# Whitelist Creators for Unlimited Markets

## Overview
Add a `unlimited_markets` boolean to the `profiles` table. Super admins toggle it per-user from the Admin Users page. The Create page and Profile page skip the free-market-limit check when this flag is true.

## Changes

### 1. Database Migration
Add column to `profiles`:
```sql
ALTER TABLE public.profiles ADD COLUMN unlimited_markets boolean NOT NULL DEFAULT false;
```

### 2. `src/pages/admin/AdminUsers.tsx`
- Add an "Unlimited Markets" toggle button (infinity icon) next to each user row, visible only to super admins.
- Clicking it updates `profiles.unlimited_markets` via Supabase and logs an audit event.
- Show an infinity badge on whitelisted users.

### 3. `src/pages/Create.tsx`
- Fetch `unlimited_markets` from the user's profile alongside verification level.
- In the free market limit check (~line 1284), skip the limit when `unlimited_markets === true` — don't set `exceededFreeLimit` or `feeBypass`.

### 4. `src/pages/Profile.tsx`
- When displaying the "Free markets remaining" progress bar (~line 1607), show "Unlimited" instead of the count/limit if the user has `unlimited_markets === true`.

## Files Modified
- **Migration**: Add `unlimited_markets` column to `profiles`
- `src/pages/admin/AdminUsers.tsx` — toggle button for super admins
- `src/pages/Create.tsx` — skip limit check for whitelisted creators
- `src/pages/Profile.tsx` — show "Unlimited" label

