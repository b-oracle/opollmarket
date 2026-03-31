

# Fix: Range Market Resolution & Copy Trade Commission Calculation

## Problem
1. **Range markets use binary logic** — Line 260 only checks `market.market_type === "multi"`, so range markets fall through to `payoutPerShare = 1` (binary), risking overpayment.
2. **Copy trade commission assumes $1/share** — Line 421 only checks for `"multi"` (not `"range"`), and line 425 hardcodes `pos.shares * (1 - pos.avg_price)` instead of using the actual `payoutPerShare`.

## Changes

### File: `supabase/functions/resolve-market/index.ts`

**Fix 1 — Line 260**: Add `"range"` to the parimutuel branch:
```
if (market.market_type === "multi" && totalWinnerShares > 0)
→
if ((market.market_type === "multi" || market.market_type === "range") && totalWinnerShares > 0)
```

**Fix 2 — Lines 418-429**: Use `payoutPerShare` (already computed above) instead of hardcoded `1`, and add `"range"` to the winner check:
```typescript
const isWinner =
  (market.market_type === "binary" && winning_side && pos.side === winning_side) ||
  ((market.market_type === "multi" || market.market_type === "range") && winning_option_id && pos.option_id === winning_option_id);

if (isWinner) {
  copierProfit += pos.shares * (payoutPerShare - pos.avg_price);
} else {
  copierProfit -= pos.shares * pos.avg_price;
}
```

This requires `payoutPerShare` to be accessible in the copy trade section. It's already declared in the same function scope, so no structural changes needed.

## Summary
- 1 file: `supabase/functions/resolve-market/index.ts`
- ~4 lines changed
- No database migrations

