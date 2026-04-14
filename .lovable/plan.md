

## Fix: Referral code validation looks up wrong column

### Problem
The `get_user_id_by_username` database function matches against `display_name` instead of `username`. Referral links use the `username` field (e.g. `?ref=johndoe`), so when a user's display name differs from their username, the lookup returns null and shows "Invalid referral code."

The same bug exists in `is_valid_referral_code` — it also checks `display_name` instead of `username`.

### Root Cause
Both functions were created matching against `lower(display_name)` instead of `lower(username)`:
```sql
-- Current (broken)
SELECT id FROM profiles WHERE lower(display_name) = lower(_username) LIMIT 1
```

### Fix
One database migration to update both functions to query the `username` column:

```sql
-- Fix get_user_id_by_username
CREATE OR REPLACE FUNCTION public.get_user_id_by_username(_username text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE lower(username) = lower(_username) LIMIT 1
$$;

-- Fix is_valid_referral_code (text overload)
CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(_code)
  )
$$;
```

### Files Changed
- **Database migration** — Update both functions to use `username` column

No frontend changes needed — the Auth page already passes the correct username value.

