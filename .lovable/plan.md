

# Rename "Bet" → "Prediction" / "Trade" across Admin & Quick Trade

## Summary
Replace all user-facing instances of "bet" with context-appropriate alternatives:
- **Admin panel (prediction context)** → "Prediction"
- **Admin panel (Quick Trade context)** → "Trade"
- **Quick Trade page & components** → "Trade"

## Files & Changes

### 1. `src/pages/admin/AdminTransactions.tsx`
- Line 23: `buy: { label: "Bet" }` → `"Prediction"`
- Line 24: `bet: { label: "Bet" }` → `"Prediction"`

### 2. `src/pages/admin/AdminSettings.tsx`
- Line 428: `"Pool (bet amount)"` → `"Pool (trade amount)"`
- Line 444: `"bet limits"` → `"trade limits"`
- Line 458: `"Bet Limits"` → `"Trade Limits"`
- Line 459: `"bet amounts"` → `"trade amounts"`
- Line 464: `"Min Bet ($)"` → `"Min Trade ($)"`
- Line 468: `"Max Bet ($)"` → `"Max Trade ($)"`
- Line 472: `"Max bet must be ≥ min bet"` → `"Max trade must be ≥ min trade"`

### 3. `src/pages/admin/AdminChecklist.tsx`
- Line 38: `"first bet"` → `"first prediction"`

### 4. `src/pages/admin/AdminAnalytics.tsx`
- Line 372: `"No bet events recorded yet"` → `"No prediction events recorded yet"`

### 5. `src/components/admin/UserActivityDrawer.tsx`
- Line 234: The `bet` key maps to an icon config — keep the key (it's a data value) but if there's a display label, change it to "Prediction"

### 6. `src/pages/QuickTrade.tsx` (UI-facing strings only)
- Line 993: `"Minimum bet is $..."` → `"Minimum trade is $..."`
- Line 997: `"Maximum bet is $..."` → `"Maximum trade is $..."`
- Line 1049: `"bet placed!"` → `"trade placed!"`
- Line 1075: `"Failed to place bet"` → `"Failed to place trade"`
- Internal variable names (betAmount, userBet, etc.) left unchanged — they are code-only, not user-facing

### 7. `src/components/quick-trade/QuickTradeBetControls.tsx`
- Line 35: `"Your bet:"` → `"Your trade:"`
- Line 104: `"Placing bet..."` → `"Placing trade..."`

### 8. `src/components/quick-trade/QuickTradeHistory.tsx`
- No user-facing "bet" strings found — no changes needed

