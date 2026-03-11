

## Fix Commission Amount Sign in Transaction History

### Problem
On line 1350-1351 of `src/pages/Profile.tsx`, the amount sign logic only treats `sell`, `deposit`, `payout`, and `refund` as positive (green, `+$`). Commission is money *earned* by the user (creator fee or admin fee), so it should also display as positive/green — not negative/red.

### Change

**`src/pages/Profile.tsx`** (line 1350-1351) — Add `commission` to the positive types list:

```typescript
// Before
["sell", "deposit", "payout", "refund"].includes(tx.type)

// After  
["sell", "deposit", "payout", "refund", "commission"].includes(tx.type)
```

This applies to both the color class check and the `+`/`-` prefix, both on the same line. Commissions will then show as green `+$0.40` instead of red `-$0.40`.

