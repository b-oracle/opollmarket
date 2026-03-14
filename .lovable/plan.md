

## Plan: Auto-assign BOracle as default referrer

### What changes
When a new user signs up without a referral code, they will automatically be assigned BOracle (`cec1e746-a073-4841-b8a6-15e85b1c4a3a`) as their referrer. This means:
- BOracle earns the one-time registration bonus (to bonus_balance) when the user places their first prediction
- BOracle earns ongoing per-trade referral commissions on every prediction the user makes

### Technical change

**Database migration** — Update the `handle_new_user()` trigger function:

Currently, `referred_by` is only set when the user provides a referral code via `raw_user_meta_data`. The change adds a fallback: if no referral code is provided, set `referred_by` to BOracle's UUID.

```sql
-- In the INSERT into profiles:
-- Before: referred_by could be NULL
-- After:  referred_by defaults to BOracle when NULL

v_referred_by := COALESCE(v_referred_by, 'cec1e746-a073-4841-b8a6-15e85b1c4a3a'::uuid);
```

This single line is added after the existing referral parsing block and before the `INSERT INTO profiles`.

**Also**: Update existing users who have `referred_by = NULL` to point to BOracle (data update via insert tool), so they also generate commissions going forward.

### Files changed
| Change | Type |
|--------|------|
| `handle_new_user()` function | DB migration |
| Existing profiles with NULL referred_by | Data update |

