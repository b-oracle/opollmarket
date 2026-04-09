

## Plan: Username requirement for registration + backfill existing users

### Problem
1. Existing users without a custom username need one assigned
2. New registrations should require a username field
3. Usernames must be unique

### Changes

#### 1. Backfill existing users without usernames (DB migration)
Run a one-time SQL migration that assigns a random username (using the existing `generate_unique_username` function) to any profile where `username` is NULL or empty.

```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id, display_name FROM profiles WHERE username IS NULL OR username = '' LOOP
    UPDATE profiles SET username = generate_unique_username(COALESCE(r.display_name, 'user'))
    WHERE id = r.id;
  END LOOP;
END $$;
```

Also add a NOT NULL constraint (with a default) to prevent future NULL usernames, and a unique index if not already present.

#### 2. Add username field to signup form (`src/pages/Auth.tsx`)
- Add a `username` state variable
- Add a username input field in the signup form (below Display Name)
- Show `@` prefix, validate: min 3 chars, alphanumeric + underscores only
- Check uniqueness on blur via a quick query before submission
- Pass username through signup metadata so the DB trigger can use it

#### 3. Update `signUp` in `src/hooks/useAuth.ts`
- Accept `username` parameter alongside `displayName`
- Include `username` in `options.data` metadata

#### 4. Update `handle_new_user()` DB function (migration)
- Read `username` from `raw_user_meta_data` if provided
- Use it instead of auto-generating, falling back to `generate_unique_username` if not provided (for Google OAuth signups)

### Files to modify
- `src/pages/Auth.tsx` — add username input field + client-side validation
- `src/hooks/useAuth.ts` — pass username in signup metadata
- DB migration — backfill usernames + update `handle_new_user()` trigger + add NOT NULL constraint

