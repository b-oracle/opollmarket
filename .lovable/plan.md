

## Plan: Show "Market Closed" Indicator for Forex & Commodities

### Context
Forex markets trade Sunday 5pm ET – Friday 5pm ET. Commodities (metals, oil) follow similar schedules. Crypto trades 24/7. When markets are closed, prices appear flat, confusing users. We should indicate when a market is closed.

### Approach

**1. Add a market hours utility (`src/lib/marketHours.ts`)**
- `isForexMarketOpen()`: Returns true Sunday 5pm ET – Friday 5pm ET (standard forex hours)
- `isCommodityMarketOpen()`: Similar logic (metals trade ~same hours; oil slightly different but we'll use the same window for simplicity)
- `isMarketOpen(assetClass)`: Routes to the right check; crypto always returns true
- `getNextOpenTime(assetClass)`: Returns a human-readable string like "Opens Sunday 5:00 PM ET"

**2. Update `LivePriceBadge` component**
- Import `isMarketOpen` and `getNextOpenTime`
- Use `getAssetClass(asset)` to determine the asset type
- When market is closed, show a "Market Closed" sub-banner (similar to the existing proximity banners) with a moon/clock icon and the next open time
- Change the pulsing dot color to gray when closed
- Still show the last known price but with a "Last close" label

**3. Update Quick Trade UI (`src/components/quick-trade/QuickTradeBetControls.tsx`)**
- Show a "Market Closed" badge/banner for forex and commodity assets when outside trading hours
- Optionally disable betting controls when the market is closed (or just show a warning)

### Files to Create/Modify
- **Create**: `src/lib/marketHours.ts` — market hours logic
- **Modify**: `src/components/LivePriceBadge.tsx` — add closed state UI
- **Modify**: `src/components/quick-trade/QuickTradeBetControls.tsx` — add closed indicator

