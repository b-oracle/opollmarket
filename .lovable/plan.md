

## Plan: Add Partial Deposit Approval with Custom Amount

### Problem
When a user sends slightly less crypto than expected (e.g., 13.3743 instead of 13.3898 USDT), the deposit stays as "partial" or "pending" with no way for admins to credit the actual received amount. The current "Confirm" button always credits the full original amount.

### Changes

**`src/pages/admin/AdminDeposits.tsx`**

1. Add a state variable for a custom amount input per deposit row (e.g., `editingId` and `editAmount`).
2. For pending/partial deposits, add two buttons:
   - **Confirm Full** — works as today, credits the original amount
   - **Approve Partial** — opens an inline input pre-filled with the deposit amount, letting the admin type the actual received amount, then calls the edge function with that custom amount
3. The partial approve input validates that the entered amount is > 0 and ≤ the original deposit amount.

**`supabase/functions/confirm-deposit-admin/index.ts`**

Already supports receiving a custom `amount` less than or equal to the original — no changes needed. The edge function already validates `amount <= originalAmount` and credits accordingly.

### Customer Resolution
After the feature is deployed, the admin can find BabyBC400's partial deposit, click "Approve Partial", enter 13.3743, and confirm. Only $13.37 will be credited to their balance.

