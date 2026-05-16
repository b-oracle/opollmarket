## Goal

1. Recurring **Silver (XAG) Up or Down** rounds, mirroring the existing crypto rounds (BTC/ETH/SOL/BNB/XRP).
2. New **"Up & Down"** tab on the home page that filters to every recurring up/down market (crypto + silver).

## What exists today

- `crypto-round-spawner` edge function spawns recurring rounds for crypto assets only (BTC/ETH/BNB/SOL/XRP) and reads enabled (asset, duration) pairs from `crypto_round_config`.
- `resolve-quick-round` resolver already supports XAG (silver) via Twelve Data / metals.dev — so resolution is ready, only spawning is missing.
- Markets carry `is_crypto_round = true` and `auto_resolve_asset = 'BTC' | ...`. The home filter tabs on `src/pages/Index.tsx` don't expose them as a distinct tab — they're mixed into All / Trending / New.

## Changes

### 1. Spawner — add Silver

Edit `supabase/functions/crypto-round-spawner/index.ts`:

- Add `XAG` to `ASSET_NAME` ("Silver") and `ASSET_IMAGES` (silver icon URL).
- Extend `fetchPrice(asset)`: when asset is `XAG`, fetch via Twelve Data (`symbol=XAG/USD`, key already in env) with metals.dev fallback — same chain `resolve-quick-round` already uses, so prices line up between open and resolve.
- Title/description automatically read from `ASSET_NAME`, so they become "Silver Up or Down — 15 minutes?" etc.

### 2. Config seed

Insert four rows into `crypto_round_config` for XAG at 5 / 15 / 60 / 1440 minutes, `category = 'Commodity'`. Enable the **15m** variant by default to match the active BTC/SOL 15m rounds; leave the other durations disabled so admins can toggle them on from `AdminQuickTrade` (no UI change needed — the page already lists every row in the table).

### 3. Home page tab

Edit `src/pages/Index.tsx`:

- Add a new filter tab `{ key: "updown", label: "📈 Up & Down" }` to the tab strip (between "🔴 Live" and "New").
- In `filteredMarkets`, add branch: `else if (filter === "updown") filtered = markets.filter(m => m.isCryptoRound);`
- Keep the existing category filter compatible (e.g. picking "Commodities" + "Up & Down" narrows to silver rounds only).

No changes to `MarketCard`, `MarketDetail`, the resolver, or DB schema.

## Open question

Silver markets respect commodity market hours (Mon–Fri, exchange sessions). The crypto spawner runs 24/7. Two options:

- **A.** Spawn silver rounds 24/7 like crypto. Off-hours rounds will simply resolve at the last available price feed snapshot.
- **B.** Skip spawning silver outside commodity market hours (gate inside the spawner via `isMarketOpen('commodity')`).

Default in this plan: **A** (simplest, matches what users expect from "just like crypto"). Tell me if you'd rather have **B**.

## Files touched

- `supabase/functions/crypto-round-spawner/index.ts` — add XAG support
- `supabase/migrations/<new>.sql` — seed 4 XAG rows in `crypto_round_config`
- `src/pages/Index.tsx` — new "Up & Down" tab + filter branch
