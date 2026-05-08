
## Goal

Make our Crypto Up/Down market detail look and feel like the Polymarket reference video: louder header, bolder price block, P&L brackets on the chart, and a round-anchored timeline that grows left → right instead of a sliding window.

## What changes (UI only)

All work stays in `src/pages/MarketDetail.tsx` and the existing quick-trade components — no business logic, no payouts, no engine math.

### 1. Header strip (above the chart)

File: `src/pages/MarketDetail.tsx` (crypto-round branch) + small tweaks to the asset/timer row.

- Asset row: bigger title (`BTC Up or Down 5m`), date/window subtitle (`May 8, 2:30–2:35 PM`).
- Countdown: render minutes and seconds as two huge red blocks (`03  37` with `MINS` / `SECS` labels under each), like the reference. Reuse existing `CryptoRoundCountdown` data, just restyle.

### 2. Price block — `PriceToBeatHeader.tsx`

- Drop the bordered card; switch to a flat two-column block.
- Left column: small gray "Price To Beat" label + **bold $80,225.81** in a large size (≈ `text-2xl font-extrabold`).
- Right column: small "Current Price" label (orange when active) + **bold orange $80,242.93** in the same large size.
- Replace the small `+0.021%` chip with a Polymarket-style **dollar delta** chip: green `▲ $17` / red `▼ $17`, where the dollar value = `currentPrice − openPrice` rounded.
- On resolve, keep the slot-machine animation but swap the right column to "Final Price" with the win/lose color we already compute.

### 3. Chart — left → right, round-anchored

File: `src/components/quick-trade/SimpleAreaChart.tsx` (and the `PolylineChart` twin).

Today `toX(i) = (i / (pts-1)) * chartW`, so points are evenly spaced and a sliding window pushes old data left as new ticks arrive. Polymarket maps x to **wall-clock time inside the round window**, so the line literally draws from the left edge at round start to the right edge at round end.

- Accept two new optional props: `windowStartMs` and `windowEndMs`.
- When both are provided, change the x mapping to `toX(ts) = ((ts − start) / (end − start)) * chartW`, clamped to `[0, chartW]`.
- The line then begins flush against the left edge at round-open and progresses rightward as time elapses, leaving empty space ahead of the live cursor — matching the reference exactly.
- For non-round usage (regular markets), fall back to today's index-based mapping so nothing else regresses.
- Pass `windowStartMs = new Date(activeRound.created_at).getTime()` and `windowEndMs = start + duration_seconds * 1000` from `MarketDetail.tsx`.
- Bottom timestamps: render 2–3 ticks from `windowStart` to `windowEnd` (e.g. `7:31:08 PM`, `7:31:17 PM`, `7:31:25 PM`) under the chart, replacing the generic "Last 5m" caption when in a crypto round.

### 4. P&L brackets on the left axis

New tiny overlay inside `SimpleAreaChart.tsx`, only when `entryPrice != null` and a user wager amount is known.

- Compute a few price levels above and below `entryPrice` corresponding to round dollar P&L on the user's stake at the current odds (e.g. `+$1, +$3, +$5, +$7` above; `-$2, -$3` below).
- Plot them as small colored labels on the **left** edge at the corresponding y position (green above entry for "up" bet, red below — mirrored for "down" bet).
- Stake source: the existing `userBet.amount` (or wager) already loaded for the active round; if not present, skip the brackets gracefully.
- Pure render layer — no recalculation of payouts, just `level = entry ± Δ` for visualization.

### 5. Up / Down buttons

File: `src/components/quick-trade/QuickTradeBetControls.tsx` (or wherever the two buy buttons render in the crypto-round path).

- Make them taller, full-width, bolder text (`text-lg font-bold`), with the cents price displayed prominently (`Up 62¢`, `Down 39¢`).
- Keep the existing onClick / disable / pending logic untouched.

## Out of scope

- No changes to round spawning, resolution, payouts, RLS, or pricing math.
- No changes to non-crypto markets except the optional, opt-in chart props (default behavior unchanged).
- No new tables, no edge functions.

## Acceptance

- Opening a live BTC/ETH/SOL Up-or-Down round shows: huge red MM:SS countdown, bold "Price To Beat" + bold orange "Current Price" with a `▲/▼ $X` dollar chip, an orange line that starts at the left edge at round-open and advances rightward over the 5-minute window, P&L bracket labels on the left axis when the user has a wager, and tall bold green/red Up/Down buttons.
- Regular (non-crypto) markets render unchanged.
