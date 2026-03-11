

## Fix Quick Trade Chart Indicators + Add Quick Trade History to Profile

### Issue 1: Confusing Chart Indicators When Trading DOWN

**Root causes identified:**

1. **Chart color ignores user's bet side** — The area/candle chart color is always green when price goes up and red when price goes down (`QuickTradeChart.tsx` line 91-94). If you bet DOWN, a rising price means you're *losing*, but the chart shows green, which is confusing.

2. **No distinct "Entry" line on area/candle charts** — Only a "Target" reference line exists (line 123-131), labeled "Target $X". There's no clear "Entry" marker to show where the user entered. The entry and target are actually the same `open_price`, so both concepts collapse into one ambiguous line.

3. **P&L overlay on TradingView chart is correct** but the area/candle chart P&L badge (line 1139-1150 in QuickTrade.tsx) calculates correctly for both sides — this part works fine.

**Fix plan for `QuickTradeChart.tsx` and `QuickTrade.tsx`:**

- When a user has an active bet, **override the chart color** to reflect P&L relative to their side: if user bet DOWN, the chart area should be green when price drops below entry and red when above entry (inverted from default).
- Rename "Target" label to **"Entry"** on the reference line since it represents the user's entry price (open_price).
- Add a distinct visual marker (e.g., different label/style) so the entry point is clearly distinguishable.

### Issue 2: Quick Trades Not Showing in Profile Trade History

**Root cause:** `src/pages/Profile.tsx` only queries the `transactions` table (buy/sell/deposit/withdraw). Quick trade bets from `quick_bets` table are never fetched or displayed.

**Fix plan for `src/pages/Profile.tsx`:**

- Add a query for the user's `quick_bets` joined with `quick_rounds` data.
- Merge quick trade entries into the transaction history list (or add a separate "Quick Trades" filter option alongside "all", "trades", "deposits").
- Display quick trade entries with the Zap icon, showing side (UP/DOWN), asset, amount, payout, and status, matching the style already used in `QuickTradeHistory.tsx`.

### Files to modify:
1. `src/components/quick-trade/QuickTradeChart.tsx` — Pass user bet side, override chart color logic
2. `src/pages/QuickTrade.tsx` — Pass `userBet` side info to chart, rename target label to entry
3. `src/pages/Profile.tsx` — Add quick_bets query and display in transaction history

