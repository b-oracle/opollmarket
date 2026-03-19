

# Remove Earnings Filter & Make Filter Buttons Scrollable

## Changes in `src/pages/Profile.tsx`

1. **Remove "earnings" from FilterType** (line 55): Change type to `"all" | "trades" | "deposits" | "withdrawals" | "quick_trades"`

2. **Remove earnings filter logic** (line 979): Delete the `else if (txFilter === "earnings")` branch

3. **Remove "earnings" from filter button array** (line 1563): Change array to `["all", "trades", "quick_trades", "deposits", "withdrawals"]`

4. **Make filter row horizontally scrollable** (line 1562): Replace `flex-wrap` with `overflow-x-auto scrollbar-hide flex-nowrap whitespace-nowrap` so buttons scroll horizontally instead of wrapping

