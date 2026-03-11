

## Distinguish Transaction Types in Profile History

### Problem
The transactions table has 7 distinct types: `buy`, `sell`, `deposit`, `withdrawal`, `commission`, `payout`, `refund`. Additionally, some "buy" transactions have `side = "initial_liquidity"` (market creation liquidity). Currently, the Profile only recognizes 4 types (`buy`, `sell`, `deposit`, `withdraw`) in its `txConfig` mapping, so commissions, payouts, refunds, and initial liquidity all display as generic "Buy" entries.

### Changes to `src/pages/Profile.tsx`

1. **Expand `TxType` and `txConfig`** to include all transaction types with distinct labels, icons, and colors:

| DB Type | Side | Display Label | Icon | Color |
|---------|------|--------------|------|-------|
| `buy` | `initial_liquidity` | Market Liquidity | Sparkles | amber |
| `buy` | `yes`/`no` | Prediction | ArrowDownLeft | primary |
| `commission` | — | Commission | BarChart3 | amber |
| `payout` | — | Payout | Gift | green |
| `refund` | — | Refund | Repeat | blue |
| `sell` | — | Sell | ArrowUpRight | destructive |
| `deposit` | — | Deposit | ArrowDownToLine | primary |
| `withdrawal` | — | Withdrawal | ArrowUpFromLine | muted |

2. **Update the rendering logic** (~line 1310) to pick the correct config based on both `type` and `side`:
   - If `type === "buy"` and `side === "initial_liquidity"` → show "Market Liquidity" with Sparkles icon
   - If `type === "commission"` → show "Commission" with a distinct icon/color
   - If `type === "payout"` → show "Payout" with Gift icon in green
   - If `type === "refund"` → show "Refund" with Repeat icon
   - Map `withdrawal` (DB) to display correctly (currently only maps `withdraw`)

3. **Update amount sign logic** (~line 1344) so commission/payout/refund show the correct +/- prefix:
   - `payout`, `refund`, `deposit`, `sell` → positive (green, `+$`)
   - `buy`, `commission`, `withdrawal` → negative (red, `-$`)

4. **Update filter logic**: The "trades" filter should include `buy` and `sell` but exclude `commission`, `payout`, and `refund`. Add these non-trade types to "all" view. Commissions/payouts/refunds can appear under "all" or optionally under a new "other" filter if needed — keeping it simple with "all" for now.

### Files to modify
- `src/pages/Profile.tsx` — Expand txConfig, update rendering and filter logic

