

## Plan: Auto-confirm API-created users and return session token

### Problem
The `create-user` endpoint in the public API creates users with `email_confirm: false`, requiring email verification. API partners using pseudo-emails (e.g., `user@nyxly.io`) can't verify emails, so they never get a session token to call `deposit` or `place-bet`.

### Solution
Update the `create-user` handler in `supabase/functions/api-public/index.ts` to:

1. Set `email_confirm: true` when creating the user via `admin.auth.admin.createUser()`
2. After user creation, generate a session token using `admin.auth.admin.generateLink()` or sign in with `signInWithPassword` to return an `access_token` and `refresh_token`
3. Return the tokens in the response so partners can immediately use them for authenticated actions

### Changes

**File: `supabase/functions/api-public/index.ts`** (lines 315-326)

- Change `email_confirm: false` → `email_confirm: true`
- After successful creation, call `admin.auth.signInWithPassword({ email, password })` to generate a session
- Return `{ user: { id, email }, access_token, refresh_token }` instead of `{ email_verification_required: true }`

### Security considerations
- This only affects users created through the API (requires valid API key with `trade` permission)
- Regular web signups remain unaffected — they still go through email verification
- API keys are already rate-limited and permission-scoped

