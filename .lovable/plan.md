

## Plan: Link X (Twitter) Account to User Profile

### Overview
Allow users to connect their X account via OAuth 2.0 PKCE flow. Once linked, their verified handle displays on their profile, they can auto-share predictions, and their X identity is confirmed.

### What's Needed

**1. Database Changes (Migration)**
- Add columns to `profiles`: `twitter_username TEXT`, `twitter_id TEXT`, `twitter_avatar_url TEXT`, `twitter_linked_at TIMESTAMPTZ`
- Create `twitter_tokens` table (user_id, access_token, refresh_token, expires_at, scopes) with RLS restricting access to service role only — no client reads
- Add unique constraint on `twitter_id` to prevent two OPOLL accounts linking the same X account

**2. Twitter Developer App Setup**
- You'll need to configure OAuth 2.0 in your Twitter Developer Portal with:
  - Redirect URI pointing to an Edge Function callback
  - Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- Two new secrets needed: `X_CLIENT_ID` and `X_CLIENT_SECRET`

**3. Edge Functions**

- **`twitter-auth-start`** — Generates OAuth 2.0 PKCE authorization URL with state + code_verifier stored in a temporary `twitter_auth_sessions` table. Returns the X authorization URL for the frontend to redirect to.

- **`twitter-auth-callback`** — Handles the redirect from Twitter. Exchanges the authorization code for access + refresh tokens, fetches the user's X profile (`/2/users/me`), stores tokens in `twitter_tokens`, and updates `profiles` with `twitter_username`, `twitter_id`, `twitter_avatar_url`. Redirects user back to `/profile?twitter=linked`.

- **`twitter-post-tweet`** — Authenticated endpoint that posts a tweet on behalf of the user. Accepts `text` body, refreshes token if expired, and calls `POST /2/tweets`. Used for auto-sharing predictions.

- **`twitter-unlink`** — Revokes the token and clears `twitter_*` fields from profiles.

**4. Frontend Changes**

- **Profile Connect section** — Add "Link X Account" button (below wallet, above Telegram). When linked, show verified handle with ✓ badge and unlink option.

- **BetModal / Create page** — Add "Share to X" toggle. When enabled, after a successful bet/market creation, call `twitter-post-tweet` with a pre-formatted message including the market link.

- **UserProfile page** — Display the verified X handle as a clickable badge linking to their X profile.

**5. Auto-Share Flow**
After a bet is placed successfully, if the user has X linked and share toggle is on:
- Call `twitter-post-tweet` with text like: "I just predicted YES on '{market_title}' 🔮\n\nJoin me → https://opoll.org/market/{id}"
- Non-blocking — failure doesn't affect the bet

### Security Considerations
- `twitter_tokens` table: RLS denies all client access; only service role via Edge Functions
- PKCE flow (no client secret exposed to browser)
- State parameter to prevent CSRF
- Unique `twitter_id` constraint prevents impersonation (one X account = one OPOLL account)
- Token refresh handled server-side in Edge Functions

### Implementation Order
1. Ask user for `X_CLIENT_ID` and `X_CLIENT_SECRET`
2. Create migration (profiles columns + twitter_tokens + twitter_auth_sessions tables)
3. Build the 4 Edge Functions
4. Add UI in Profile Connect section
5. Add auto-share toggle to BetModal

