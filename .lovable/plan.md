

## Plan: Auto-follow referrer on registration

### What changes
When a new user signs up with a referral code, they will automatically follow the person who referred them (in addition to the existing auto-follow of BOracle).

### Technical change

**Database migration** — Update the `handle_new_user()` trigger function to add one more `INSERT INTO public.follows` block after the existing BOracle auto-follow:

```sql
-- Auto-follow referrer (if not BOracle, to avoid duplicate)
IF v_referred_by IS DISTINCT FROM 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid THEN
  BEGIN
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (NEW.id, v_referred_by);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user: failed to auto-follow referrer for %: %', NEW.id, SQLERRM;
  END;
END IF;
```

This ensures:
- If the referrer IS BOracle (default), no duplicate follow is created
- If the referrer is a real user, the new user follows them automatically

### Files changed
| Change | Type |
|--------|------|
| `handle_new_user()` function | DB migration |

