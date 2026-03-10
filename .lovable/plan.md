

## Plan: Add Commodities & Forex to Quick Trade

### Problem
Quick Trade currently only supports crypto assets. The `ALL_ASSETS` array in `QuickTrade.tsx` is hardcoded to 6 crypto assets with `geckoId` fields, and the backend `resolve-quick-round` edge function only resolves prices via CoinGecko.

### Changes

#### 1. Expand `ALL_ASSETS` in `src/pages/QuickTrade.tsx`
- Add commodity assets (Gold/XAU, Silver/XAG) and forex pairs (EUR/USD, GBP/USD, USD/JPY) to `ALL_ASSETS`
- Replace the `geckoId` field with a more generic `assetClass` field (`"crypto" | "commodity" | "forex"`) while keeping `geckoId` for crypto assets
- Update the `fetchPrice` and `fetchRawPriceData` wrappers to route through `fetchAssetPrice` / asset-class-aware history fetching from `cryptoPriceProvider.ts`
- The existing `cryptoPriceProvider.ts` already has `fetchCommodityPrice` (metals.dev) and `fetchForexPrice` (Frankfurter API), so the client-side price display will work

#### 2. Update the Binance WebSocket stream logic
- The `subscribeToPriceStream` in `cryptoPriceProvider.ts` uses Binance WebSocket which only supports crypto pairs
- For commodities/forex, fall back to polling (already supported via `fetchAssetPrice`) instead of streaming
- Ensure the chart and live price still update for non-crypto assets via the existing polling interval

#### 3. Update `resolve-quick-round` edge function
- Add commodity and forex price fetching alongside the existing CoinGecko crypto fetcher
- Reuse the same metals.dev and Frankfurter API patterns from `cryptoPriceProvider.ts` (but server-side in Deno)
- Update `fetchCryptoPrice` → `fetchAssetPrice` that routes by asset class

#### 4. Update admin `qt_enabled_assets` default
- Ensure the `commission_settings` default for `qt_enabled_assets` includes the new symbols so admins can toggle them

### Files Modified
- `src/pages/QuickTrade.tsx` — expand `ALL_ASSETS`, update price fetch wrappers
- `supabase/functions/resolve-quick-round/index.ts` — add commodity/forex price resolution
- `src/hooks/useCommissionSettings.ts` — update default `qt_enabled_assets` to include new symbols

### No database changes required
The `quick_rounds.asset` column is already a free-text field that will accept any symbol.

