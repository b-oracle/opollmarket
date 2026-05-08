## Goal

Bring Polymarket-style binary "Up or Down" crypto markets to the platform — same look and feel as the reference (BTC/ETH/SOL/BNB Up or Down — 5 min/15 min/etc.) — using the existing AMM market engine. They live in the **Crypto** category of the Markets feed, are created automatically on a rolling schedule, and auto-resolve from Chainlink price feeds. Quick Trade stays as-is.

## What the user gets

- Crypto category fills with rolling cards: `Bitcoin Up or Down — 5 minutes?`, `Ethereum Up or Down — 15 minutes?`, `Solana Up or Down — 1 hour?`, `BNB Up or Down — Daily`, etc.
- Each card has standard YES/NO buttons with live cents pricing (e.g., `Buy 14¢ / Buy 86¢`), the existing AMM curve, order book, limit orders, comments, share-card — everything a normal market has.
- New round auto-spawns the moment the previous round locks, so there's always a "next" 5m / 15m / 1h / 1d round visible per asset.
- Resolution happens automatically: at the end timestamp the cron compares Chainlink open vs close price and resolves YES (Up) or NO (Down). Equal → resolves to YES (matches the rule shown in the user's screenshot).

## Surfaces

- **Markets feed → Crypto tab**: cards appear inline with all other crypto markets.
- **Market detail page**: standard market detail (chart, order book, comments, positions). A small "Round ends in 4m 12s" countdown badge replaces the usual end-date string.
- **Admin → Quick Trade page**: gets a new "Auto Up/Down Markets" section to enable/disable assets, pick which durations are active, set initial liquidity per round, and pause the engine.

## Round engine

Auto-spawned per (asset × duration) pair:

```text
asset:    BTC, ETH, SOL, BNB, XRP
duration: 5m, 15m, 1h, 1d
```

For each pair the engine keeps **two markets visible at all times**: the current locked round and the next open round. As soon as the current round locks (cutoff = end_time - 5s), the next round is created and the round after that is queued.

Title format: `{Asset} Up or Down — {Duration}?` (e.g. `Bitcoin Up or Down — 5 minutes?`).

Each market stores its `open_price` (snapshot from Chainlink at start) and `close_price` (snapshot at end) in a new `crypto_round_meta` row linked to `market_id`.

## Resolution

- A `cron` job runs every 30 seconds, finds rounds whose `end_time <= now()` and that are not yet resolved.
- Edge function `resolve-crypto-round` fetches the Chainlink BTC/ETH/SOL/BNB/XRP USD price at `end_time` (same provider Quick Trade already uses), writes `close_price`, then calls the existing market-resolution RPC with winning side `yes` if `close >= open`, else `no`.
- All payouts, fee splits, on-chain audit log, push notifications, and PnL flow through the existing market resolution path — no new payout code.

## Coexistence with Quick Trade

- Quick Trade remains the binary-options "$X to win $Y" experience.
- The new markets are real AMM markets (CPMM YES/NO shares, sellable, limit-orderable). They do not share state with Quick Trade rounds.
- A single feature toggle `crypto_auto_updown_enabled` lets admins kill the engine without affecting Quick Trade.

## Database

New table `crypto_round_meta`:
- `market_id` (FK to markets, unique)
- `asset` (`btc` | `eth` | `sol` | `bnb` | `xrp`)
- `duration_minutes` (5, 15, 60, 1440)
- `open_price`, `close_price` (numeric)
- `start_time`, `end_time` (timestamptz)
- `chainlink_feed` (text)

New table `crypto_round_config` (admin-tunable):
- `asset`, `duration_minutes`, `enabled`, `initial_liquidity_usd`, `category`

RLS: `crypto_round_meta` readable by everyone, writable only by service role. `crypto_round_config` readable by everyone, writable by admins only (uses existing `has_role` pattern).

Markets table gets a soft-tag via existing `metadata` JSONB or a new `market_kind = 'crypto_auto_updown'` column to let the feed/UI badge them and to let the spawner avoid double-creating rounds.

## Edge functions

- `crypto-round-spawner` — every 30s, ensures each (asset × duration) pair has a "next" open round.
- `resolve-crypto-round` — every 30s, resolves any rounds whose `end_time` has passed, using Chainlink close price.

Both are cron-driven via `pg_cron` + `pg_net` and use the service role for the resolution RPC.

## UI changes (frontend only)

- `MarketCard`: when `market_kind = 'crypto_auto_updown'`, render the live countdown (`4m 12s` style) instead of `Ends 8th May`, and show a small `LIVE` dot like in the reference screenshot.
- Crypto category filter on the Markets feed already exists — just make sure the new auto-spawned markets land in it.
- `MarketDetail`: add a slim countdown header for these markets and a "Next round →" link to the upcoming open round of the same (asset × duration).
- Admin Quick Trade page gets an "Auto Up/Down Engine" panel: toggle per asset/duration, set initial liquidity, pause-all switch.

## Out of scope (future)

- "Above ___ on May 8?", "What price will BTC hit in May?", "Price range" and "Hit price" cards from screenshot 2 — those are different market shapes; this plan only ships **Up or Down**. We can add the others as follow-ups using the same engine pattern.
- Sell-back UX changes, new payout math, or any Quick Trade modification.

## Rollout

1. Migration: `crypto_round_meta`, `crypto_round_config`, `market_kind` column, RLS.
2. Edge functions: spawner + resolver, with cron schedules.
3. Seed `crypto_round_config` with all 5 assets × 4 durations, `enabled=false` by default.
4. Admin panel to flip them on.
5. Frontend `MarketCard` + `MarketDetail` countdown rendering.
6. Enable BTC 5m + 15m first as a pilot, monitor for a day, then enable the rest.
