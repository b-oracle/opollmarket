

## Plan: Add 2x Deposit Withdrawal Cap

### How it works
- **Rule**: A user can withdraw at most 2× their total confirmed deposits. Each withdrawal reduces the remaining eligible amount.
- **Formula**: `max_eligible_withdrawal = (2 × total_confirmed_deposits) - total_confirmed_withdrawals`
- **On new deposit**: The new deposit amount adds to the pool, unlocking up to 2× that deposit in additional withdrawals.

### Technical approach

**No schema changes needed.** All the data already exists in the `transactions` table — we just need to query confirmed deposits and confirmed/completed withdrawals.

### Changes

#### 1. Edge function: `supabase/functions/request-withdrawal/index.ts`
Add a check after the existing deposit-required check (around line 137):

- Query `SUM(amount)` from `transactions` where `user_id = userId`, `type = 'deposit'`, `status = 'confirmed'` → `totalDeposits`
- Query `SUM(amount)` from `transactions` where `user_id = userId`, `type = 'withdrawal'`, `status = 'confirmed'` → `totalWithdrawn`  
- Also sum completed `withdrawal_requests` to catch any not yet in transactions
- Calculate `maxEligible = (2 * totalDeposits) - totalWithdrawn`
- If `amount > maxEligible`, return 400 with message: `"Withdrawal exceeds your eligible limit. You can withdraw up to $X.XX more. Deposit additional funds to increase your limit."`

#### 2. Frontend: `src/components/DepositWithdrawModal.tsx`
- Show the user's remaining eligible withdrawal amount on the withdraw tab as an informational note (e.g., "Eligible withdrawal remaining: $500.00")
- Query the same totals client-side to display this, using the transactions table which users can already read

This is purely server-enforced (edge function), so it cannot be bypassed from the client.

