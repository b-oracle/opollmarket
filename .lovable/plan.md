

# Capital-First Parimutuel Payout Logic

## What Changes

Update the parimutuel payout model so winners get their capital (original wager) back first, then the remaining pool (losers' wagers) is distributed as profit proportionally by share count.

**New formula:**
```text
totalPool       = sum of ALL wagers (winners + losers)
winnersCapital  = sum of winning wagers only
loserPool       = totalPool - winnersCapital   (this is the profit pool)
profitPerShare  = loserPool / totalWinnerShares

Each winner receives