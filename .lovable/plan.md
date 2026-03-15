

## Fix Referral Count to Include All Signups

### Problem
The referral count on the user profile page queries `referral_rewards` table, which only gets populated after a referred user makes their first prediction. Users who signed up via referral but haven't predicted yet are not counted.

### Solution
Change the query in `src/pages/UserProfile.tsx` (lines 159-162) from:

```typescript
// Current: only counts rewarded referrals
supabase.from("referral_rewards").select("id", { count: "exact", head: true }).eq("referrer_id", id)
```

To:

```typescript
// New: counts all profiles referred by this user
supabase.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", id)
```

This matches the approach already used in the Referrals page (`src/pages/Referrals.tsx`), which queries `profiles.referred_by` to get all referred signups.

### Files Changed

| File | Change |
|---|---|
| `src/pages/UserProfile.tsx` | Switch referral count query from `referral_rewards` to `profiles.referred_by` |

