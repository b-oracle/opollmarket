

# OPOLL Public API, SDK & Embed System

## Overview

Build three layers of external integration: (1) a public REST API via edge functions, (2) a JavaScript SDK that wraps the API, and (3) an embeddable market widget (iframe-based).

---

## 1. Public REST API (Edge Functions)

Create a new `api-public` edge function that acts as a gateway for all public/partner operations. Authentication uses **API keys** (not user JWT) — partners register via the platform and get a key stored in a new `api_keys` table.

### Endpoints (all under `/functions/v1/api-public`)

| Action | Method | Auth | Description |
|---|---|---|---|
| `GET ?action=markets` | GET | API key | List active markets (paginated, filterable) |
| `GET ?action=market&id=X` | GET | API key | Single market detail with prices |
| `POST action=create-user` | POST | API key | Create/link a partner user account |
| `POST action=deposit` | POST | API key + user token | Initiate deposit for a user |
| `POST action=place-bet` | POST | API key + user token | Place a prediction on behalf of a user |
| `GET ?action=balance&user_id=X` | GET | API key | Get user balance |
| `GET ?action=positions&user_id=X` | GET | API key | Get user positions |
| `GET ?action=embed-data&id=X` | GET | Public (no key) | Lightweight market data for embed widget |

### Database Changes

**New table: `api_keys`**
- `id` uuid PK
- `partner_name` text NOT NULL
- `api_key` text UNIQUE NOT NULL (generated hash)
- `is_active` boolean DEFAULT true
- `permissions` jsonb (e.g., `["read", "trade", "deposit"]`)
- `rate_limit_per_min` int DEFAULT 60
- `created_at`, `updated_at`

RLS: Admin-only access. The edge function validates keys via service role.

**New table: `api_request_logs`** (optional, for rate limiting & analytics)
- `id`, `api_key_id`, `endpoint`, `ip`, `created_at`

### Security
- API key passed via `X-API-Key` header
- Rate limiting checked per key per minute
- Trade/deposit endpoints require both API key AND a user session token
- Read-only endpoints (markets list, embed data) work with just the API key

---

## 2. JavaScript SDK

Create a standalone JS file served from the edge function or CDN that partners include on their site.

```javascript
// Usage example
const opoll = new OPOLL({ apiKey: 'pk_live_xxx' });

// List markets
const markets = await opoll.getMarkets({ category: 'crypto', limit: 10 });

// User auth (creates or links account)
const user = await opoll.authenticateUser({ email, password });

// Place bet
await opoll.placeBet({ marketId, side: 'yes', amount: 10 });

// Get balance
const balance = await opoll.getBalance();
```

**Implementation**: A single `supabase/functions/sdk-js/index.ts` edge function that serves a minified JS file. The SDK is a thin wrapper around `fetch()` calls to the `api-public` endpoint.

---

## 3. Embeddable Market Widget

An iframe-based embed that partners paste into their HTML.

```html
<iframe src="https://opoll.org/embed/market/MARKET_ID" 
  width="400" height="300" frameborder="0"></iframe>
```

### Frontend Changes
- **New route `/embed/market/:id`** — A minimal, standalone page that renders:
  - Market title, category icon, yes/no prices with bar chart
  - Volume, participants, time remaining
  - "Predict on OPOLL" CTA button → links to `https://opoll.org/market/MARKET_ID`
  - OPOLL branding/watermark
  - Dark theme, no nav/sidebar/bottom bar
- **Copy embed code button** on the existing MarketDetail page and ShareModal

### Admin Changes
- New section in admin dashboard to manage API keys (create, revoke, view usage)

---

## 4. Additional Ideas

Here are bonus features worth considering:

1. **Webhook notifications for partners** — Let API partners register a webhook URL. When a market resolves or a user's bet pays out, POST the event to their URL. Great for keeping partner apps in sync.

2. **Affiliate/revenue share for API partners** — Track bets placed through each API key and pay partners a commission (e.g., 5% of prediction fees from their traffic). Incentivizes integration.

3. **WordPress plugin** — Package the embed widget + SDK into a WP plugin so non-technical site owners can add markets with a shortcode like `[opoll market="abc123"]`.

4. **Market ticker widget** — A slim horizontal ticker (like a stock ticker) showing trending markets and prices. Embeddable via a single line of HTML. Good for news sites and finance blogs.

5. **White-label mode** — Allow partners to customize the embed colors, logo, and branding via API key settings. Premium feature.

---

## Files to Create/Edit

| File | Action |
|---|---|
| Migration SQL | Create `api_keys` table |
| `supabase/functions/api-public/index.ts` | New — main API gateway |
| `supabase/functions/sdk-js/index.ts` | New — serves the JS SDK file |
| `src/pages/EmbedMarket.tsx` | New — minimal embed page |
| `src/App.tsx` | Add `/embed/market/:id` route |
| `src/components/ShareModal.tsx` | Add "Copy Embed Code" option |
| Admin pages | New API key management UI |

