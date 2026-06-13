# Event Groups (Polymarket-style)

Group multiple independent binary markets under one **event** with a shared overlaid chart, while each outcome remains its own market with its own Yes/No prices, liquidity, order book, and trading flow.

## Data model

New tables (admin-managed):

- `market_events`
  - `id`, `slug` (unique), `title`, `description`, `image_url`, `category`, `end_date`, `status` (`active`/`resolved`/`closed`), `volume` (denorm sum), `created_at`, timestamps
- `market_event_members`
  - `event_id` → `market_events.id`
  - `market_id` → `markets.id` (unique — a market belongs to at most one event)
  - `display_label` (override, e.g. "Portugal"), `sort_order`, `color` (chart line), `flag_emoji`/`icon_url`

No changes to existing `markets`/`positions`/`transactions` schema — children remain full standalone binary markets. Event volume/participants are computed as the sum across members.

RLS: public SELECT on both tables; INSERT/UPDATE/DELETE restricted to `admin`/`moderator` via `has_role`. Standard GRANTs to `anon` + `authenticated` for SELECT, `service_role` ALL.

## Admin flow

New admin page `src/pages/admin/AdminEvents.tsx`:
- Create event (title, slug, image, category, end_date)
- Attach existing binary markets as members (search + multi-select)
- Reorder, set display label / color / flag per member
- Detach / archive
- Reachable from `AdminLayout` sidebar

## Public routes & pages

- `/event/:slug` → `src/pages/EventDetail.tsx`
  - Header: image, title, total volume (sum of children), end date countdown
  - **Overlaid chart**: all member markets' Yes-price history on one chart (multi-color lines, legend with current %)
  - Outcomes list: each row = one child market with `Buy Yes Xc` / `Buy No Yc` buttons opening the existing buy modal scoped to that market
- `/markets/:id` (existing) gets a small "Part of: <event title>" pill linking back to the event when the market is a member

Home/Discover: add an "Events" rail above markets list showing event cards (image + top outcomes).

## Chart implementation

- Reuse `usePriceHistory` pattern but extended to fetch transactions across **all member market_ids** in one query, then bucket per market.
- New hook `useEventPriceHistory(eventId, timePeriod)` returns `{ series: { marketId, label, color, points: [{t, yes}] }[] }`.
- Render with Recharts `LineChart` + one `Line` per series. Reuse 1H/1D/1W/1M/MAX selector.

## Trading

No new trading logic. Buy/Sell goes through the existing market-scoped buy modal and `buy-shares` / `sell-position` edge functions, hit per child market. Each child has its own AMM, liquidity, order book, limit orders, positions, PnL.

## Resolution

Children resolve individually via existing flow. Event status:
- `active` while any child is active
- `resolved` once all children resolved
- A future trigger can auto-flip event status when last child resolves (out of scope v1; admin can mark closed)

## Technical notes

- Migration creates the two tables with grants + RLS as above and an FK + unique constraint on `market_event_members.market_id`.
- `markets` list queries get an optional `event_id` join (via members) to surface event chip on cards.
- No changes to financial integrity, settlement, RLS locks on financial fields, or KYC paths.

## Out of scope (v1)

- Normalized "must sum to 100%" pricing across members
- Auto-grouping from Polymarket import (members must be attached manually for now; can be added by reading Polymarket `event_slug` field already on `markets`)
- Combo bets across outcomes
