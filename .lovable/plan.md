

## Quick Predictions: Dedicated Live Trading Page

A standalone fast-paced prediction page where users bet whether an asset (BTC, ETH, Gold, etc.) will go UP or DOWN within a short timeframe (e.g., 5 minutes). This operates as a separate experience from regular markets.

### How It Works

1. **New page at `/quick-trade`** with a real-time price chart, countdown timer, and large UP/DOWN buttons
2. Each round is a **short-lived binary market** (5 min default) auto-created and auto-resolved by the system
3. Users pick UP or DOWN, enter an amount, and the round locks when the countdown hits zero
4. After the timer expires, an edge function compares the closing price to the opening price and resolves the round

### Components to Build

**1. Database — `quick_rounds` table**
- `id`, `asset` (BTC, ETH, etc.), `duration_seconds` (default 300), `open_price`, `close_price`, `status` (open/locked/resolved), `result` (up/down/flat), `created_at`, `resolved_at`
- `quick_bets` table: `id`, `user_id`, `round_id`, `side` (up/down), `amount`, `payout`, `status`
- RLS: users read own bets, insert own bets; admins read all

**2. Edge Function — `resolve-quick-round`**
- Fetches current price from CoinGecko (reusing existing `ASSET_GECKO_MAP` pattern)
- Compares to `open_price`, sets result, pays out winners (losers' pool minus platform commission split among winners proportionally)
- Called by pg_cron every 30 seconds to check for rounds past their deadline

**3. Frontend — `src/pages/QuickTrade.tsx`**
- Asset selector tabs (BTC, ETH, BNB, SOL, Gold, etc.)
- Real-time price display (reuse `fetchAssetPrice` from CryptoPriceTicker)
- Mini candlestick/line chart showing last 15 min of price data
- Countdown timer showing time remaining in current round
- Large UP (green) / DOWN (red) buttons
- Amount input with presets
- Live pool size display (total bets this round)
- Recent rounds history at the bottom

**4. Route + Navigation**
- Add `/quick-trade` route in App.tsx
- Add a "Quick Trade" icon/link to BottomNav or as a floating action on the home page

### Round Lifecycle
```text
OPEN (accepting bets) → LOCKED (10s before end, no new bets) → RESOLVING → RESOLVED
     ←── countdown ──→    ← buffer →                           ← payout →
```

### Payout Model
- 5% platform fee on the losing pool (uses existing commission settings)
- Remaining losing pool distributed to winners proportionally by bet size
- If all bets are on one side, stakes returned minus commission (same as existing single-sided logic)

### Files to Create/Edit
- **Create**: `src/pages/QuickTrade.tsx`, `supabase/functions/resolve-quick-round/index.ts`
- **Edit**: `src/App.tsx` (add route), `src/components/BottomNav.tsx` or `src/components/DesktopSidebar.tsx` (add nav link)
- **Migration**: Create `quick_rounds` and `quick_bets` tables with RLS

