

# Capital-First Parimutuel Payout Logic

## What Changes

Update the parimutuel payout model so winners get their capital (original wager) back first, then the remaining pool (losers' wagers) is distributed as profit proportionally by share count.

**New formula:**
```text
totalPool       = sum of ALL wagers (winners + losers)
winnersCapital  = sum of winning wagers only
loserPool       = totalPool - winnersCapital   (this is the profit pool)
profitPerShare  = loserPool / totalWinnerShares

Each winner receives:
  payout = their capital (shares × avg_price) + (their shares × profitPerShare)
```

This ensures no winner can lose money on a correct prediction. The profit pool is purely losers' money, distributed proportionally to winners' share counts (rewarding early/cheap entry).

## Files to Change

### 1. `supabase/functions/resolve-market/index.ts` (lines 260-266)

Replace the current pool-proportional block:
```typescript
const allPositions = [...winningPositions, ...losingPositions];
const totalPool = allPositions.reduce((s, p) => s + p.shares * p.avg_price, 0);
const winnersCapital = winningPositions.reduce((s, p) => s + p.shares * p.avg_price, 0);
const loserPool = totalPool - winnersCapital;
const profitPerShare = totalWinnerShares > 0 ? loserPool / totalWinnerShares : 0;
```

Update payout calculation (line 269):
```typescript
const capital = pos.shares * pos.avg_price;
const profit = pos.shares * profitPerShare;
const payout = Math.round((capital + profit) * 100) / 100;
```

Keep `payoutPerShare` for copy-trade commission compatibility — compute it as `totalPool / totalWinnerShares` (unchanged effective value, just for reference).

### 2. `supabase/functions/check-auto-resolve/index.ts` (lines 682-697)

Same capital-first formula for the Twitter multi-market resolution block.

### 3. `supabase/functions/check-sports-resolve/index.ts` (lines 296-310)

Sports auto-resolve uses flat `payout = pos.shares` (binary $1/share). Sports markets are binary, so no change needed here.

## Summary
- 2 edge function files changed
- ~10 lines modified per file
- No database migrations

