

# Profile PnL Card Fixes

## Changes in `src/pages/Profile.tsx`

### 1. Remove Quick Trade from main PnL, show it separately in popover
- **Lines 1555-1562**: Keep `qtPnl` computation but remove it from the main `pnl` formula
- New formula: `pnl = totalPayouts + totalSold - resolvedBought + unrealizedPnl`
- Show `qtPnl` inside the popover breakdown so users can still see it

### 2. Change positive PnL color from blue to green
- **Line 1575**: Replace `text-primary` with `text-green-500` for `pnl > 0`

### 3. Replace Tooltip with Popover (tap-friendly)
- **Lines 1579-1586**: Swap `Tooltip`/`TooltipTrigger`/`TooltipContent` → `Popover`/`PopoverTrigger`/`PopoverContent`
- Popover content shows breakdown:
  - "Settled payouts + sells − resolved wagers + unrealized P&L from open positions"
  - Quick Trade P&L shown as a separate line item

### Technical notes
- `Popover` is already imported (line 27)
- No new dependencies needed

