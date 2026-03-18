

## Problem

The current system uses the admin user's actual balance as a "pool reserve" — all platform fees are credited to the first admin user's balance, then later debited when commissions are released to creators/referrers. This means the admin user (grindearn01) shows inflated balances and earns commission transaction records, which is misleading and undesirable.

## Solution

Replace the "admin balance as pool reserve" pattern with a **dedicated `platform_pool` table** that tracks platform revenue without touching any real user's balance. Commission payouts to creators/referrers will be funded from this pool instead of an admin user's balance.

## Changes Required

### 1. Create `platform_pool` table (migration)
- Single-row table with columns: `id`, `balance` (numeric), `updated_at`
- No RLS needed (only accessed via service role in edge functions)
- Create a `adjust_platform_pool` RPC function that atomically adjusts the pool balance (similar to `adjust_balance` but for the platform pool)

### 2. Update `place-bet/index.ts`
- Remove the admin user lookup (`user_roles` query for admin)
- Replace `adjust_balance` call on admin user with `adjust_platform_pool` RPC call
- Remove the commission transaction insert for the admin user
- Keep the rollback logic but target the platform pool instead of admin balance

### 3. Update `process-pending-commissions/index.ts`
- Replace admin balance deductions with `adjust_platform_pool` deductions
- Creator/referral payouts: deduct from platform pool, credit to recipient (no change to recipient side)

### 4. Update `request-withdrawal/index.ts`
- Replace admin fee credit with platform pool credit

### 5. Update `telegram-bot/index.ts`
- Same pattern: replace admin balance credit with platform pool credit

### 6. Update `cancel-market/index.ts`
- Replace admin balance deduction (refund reversal) with platform pool deduction

### 7. Update Admin Dashboard (display only)
- Add a "Platform Pool Balance" card on AdminDashboard or AdminCommissions that reads from the `platform_pool` table
- This gives admins visibility into platform revenue without it being tied to any user account

## What stays the same
- Commission calculations, splits, and percentages — unchanged
- Creator/referrer commission crediting logic — unchanged
- The pending_commissions 48-hour queue system — unchanged
- Transaction records for creators/referrers — unchanged

