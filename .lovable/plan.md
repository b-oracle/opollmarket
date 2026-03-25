

# Separate Bonus vs Real Revenue in Admin Analytics

## Problem
Users can pay for promotions (boosts, broadcasts, social ads) using bonus balance. Currently, the admin panel counts all promotion revenue equally, making it impossible to distinguish real money from "paper money" (bonus balance). This inflates perceived revenue.

## Changes

### 1. Database: Add `bonus_amount` column to `transactions` table
A new nullable numeric column `bonus_amount` (default 0) on the `transactions` table. This records how much of each transaction was paid from bonus balance vs real balance.

### 2. Update `pay-promotion-balance` Edge Function
When inserting transaction records for boosts, broadcasts, and social ads, calculate and store the proportional `bonus_amount` for each line item based on the overall bonus/main split ratio.

### 3. Update `AdminPredictions.tsx` — Revenue Breakdown
- Add a "Bonus Revenue" card showing total revenue from bonus balance across all promotion types
- Update the "Boosts", "Platform Profit" cards to show a small sub-label: "($X from bonus)"
- Color-code bonus amounts differently (e.g., muted/orange) so admins can instantly see what's real

### 4. Update `AdminDashboard.tsx` — Platform Revenue Pool
- Add a note or sub-metric under the Platform Revenue Pool card showing how much of the pool came from bonus-funded promotions
- This helps admins understand that portion of the pool is "paper money"

## Technical Details

**Migration:**
```sql
ALTER TABLE public.transactions 
ADD COLUMN bonus_amount numeric NOT NULL DEFAULT 0;
```

**Edge Function change** (`pay-promotion-balance`): For each transaction insert, compute the bonus portion proportionally:
```typescript
const bonusRatio = bonusDeduct / totalCost;
// For boost transaction:
const boostBonusAmount = tierConfig.price * bonusRatio;
await adminClient.from("transactions").insert({
  ..., bonus_amount: boostBonusAmount
});
```

**Admin UI**: Query `bonus_amount` alongside existing transaction data. Sum separately for boost/broadcast/ad sides and display as "(${bonusTotal} bonus)" beneath each revenue metric.

