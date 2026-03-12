

## Plan: Auto-follow BOracle for All Users

BOracle's user ID: `cec1e746-a073-4841-b8a6-15e85b1c4a3a`
Currently 9 out of 34 users already follow BOracle.

### Changes

**1. Database Migration**
- **Backfill**: Insert a follow record for every existing user who doesn't already follow BOracle (excluding BOracle themselves).
- **Update `handle_new_user()` trigger**: Add a follow insert for BOracle after the profile and balance creation, so every future signup automatically follows BOracle. Wrapped in exception handler so it never blocks signup.

```sql
-- Backfill existing users
INSERT INTO public.follows (follower_id, following_id)
SELECT p.id, 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid
FROM public.profiles p
WHERE p.id != 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'
  AND NOT EXISTS (
    SELECT 1 FROM public.follows f
    WHERE f.follower_id = p.id
      AND f.following_id = 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'
  );

-- Update handle_new_user() to add auto-follow block
```

**No frontend changes needed.** The follow counts and social feed will reflect this automatically via existing queries.

