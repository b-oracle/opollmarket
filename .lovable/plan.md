## Goal

Make commodity (Silver, Gold, Platinum, Palladium, Oil, etc.) and forex Up & Down markets behave as "closed" during their designated market-closed times — matching the schedule already defined in `src/lib/marketHours.ts` (Sun 5pm ET → Fri 5pm ET window; weekends closed). Crypto rounds stay 24/7.

## Scope

Three surfaces need to honour the closed window. Each piece is small.

### 1. Spawner — stop creating new rounds during closed hours

File: `supabase/functions/crypto-round-spawner/index.ts`

- Add a small helper `isAssetMarketOpen(asset)` that mirrors `marketHours.ts`:
  - Crypto assets → always open.
  - Commodity (`XAG`, `XAU`, `XPT`, `XPD`, `NG`, `COPPER`, `WTI`, `BRENT`) and forex (`EUR/USD`, etc.) → open Sun 17:00 ET → Fri 17:00 ET.
- In the per-config loop (around line 292), if `!force && !isAssetMarketOpen(cfg.asset)`, `continue` (skip silently; no log spam, same pattern as the existing not-yet-ended skip).
- Admin "Spawn Now" with `force=true` still bypasses, so ops can test.

### 2. Home page — show "Market Closed" on commodity/forex Up & Down cards

File: `src/pages/Index.tsx` (around line 616, the `market.isCryptoRound` branch)

- Import `isMarketOpen` and `getAssetClass`.
- For `isCryptoRound` markets where `getAssetClass(market.autoResolveAsset) !== "crypto"` and the market is closed, replace `<LiveCryptoRoundPercent />` with a small inline "Closed" pill (Moon icon + "Market Closed" text in muted/destructive tone). Crypto rounds render unchanged.

### 3. Up & Down market detail / trade interface

The general `/quick-trade` page already uses `isMarketOpen` + `MarketClosedOverlay` + the disabled bet buttons in `QuickTradeBetControls`. Verify and (if missing) wire the same check into the per-market crypto-round trading view rendered from `/market/:id` for `isCryptoRound` markets, so silver rounds opened just before close don't accept new bets after the close boundary:

- Locate the component that renders the bet buttons for an `isCryptoRound` market detail page (likely a `MarketDetail`/`CryptoRoundMarket` component — confirm during implementation).
- Pass the asset symbol to `QuickTradeBetControls` (already supported via `asset` prop) so its existing `isMarketOpen(getAssetClass(asset))` check disables UP/DOWN buttons and shows the "Market Closed — Opens Sunday 5:00 PM ET" banner.

## Out of scope

- No DB schema or RLS changes.
- No new market_hours config table — single source of truth stays `src/lib/marketHours.ts` (frontend) and the mirrored helper in the spawner (backend).
- No change to resolution logic — existing rounds spawned just before the close boundary still resolve normally against the last available price.

## Files touched

- `supabase/functions/crypto-round-spawner/index.ts` — add market-hours guard.
- `src/pages/Index.tsx` — closed pill on commodity/forex Up & Down cards.
- The crypto-round market detail trade component (path confirmed during implementation) — ensure `asset` is passed to `QuickTradeBetControls`.
