

## Rename "Trades" Tab to "Predictions"

### Problem
The filter tab currently labeled "Trades" is confusing since there's already a "Quick Trades" tab. The "Trades" tab shows prediction market buy/sell transactions and should be labeled "Predictions" instead.

### Change in `src/pages/Profile.tsx`

**Line 1250** — Update the label mapping to show "Predictions" for the `trades` filter:

```typescript
// Before
{f === "deposits" ? "Deposits" : f === "quick_trades" ? "Quick Trades" : f}

// After
{f === "deposits" ? "Deposits" : f === "quick_trades" ? "Quick Trades" : f === "trades" ? "Predictions" : f}
```

Single line change, no other modifications needed — the underlying filter logic stays the same.

