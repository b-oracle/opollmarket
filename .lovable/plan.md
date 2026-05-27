## Goal
Let bonus balance cover the **market creation fee** (and only that fee) in every creation path. Liquidity, AI generation, boost, broadcast, and auto-resolve fees stay strictly on the main balance.

## Current state
- `finalize_market_creation_atomic` already deducts bonus first, but against the **combined** `_fee_amount` (creation + auto-resolve + boost + broadcast). That over-permits bonus usage.
- `hold_creation_fee_escrow` (used by the "No NFT/BC400" bypass path) deducts only from main balance — bonus is ignored.
- Verified users who exceed their free-market limit already get routed through `feeBypass = true` (no escrow), so server-side fee logic applies; they just need the same bonus-first behavior end-to-end.

## Changes

### 1. Migration (single file)
- **`creation_fee_escrows`**: add `bonus_amount numeric NOT NULL DEFAULT 0` and `main_amount numeric NOT NULL DEFAULT 0` so refunds can return funds to the correct buckets. Backfill existing `held` rows: `main_amount = amount`, `bonus_amount = 0`.
- **`hold_creation_fee_escrow(_user_id, _amount)`**: lock balance row, take `bonus = LEAST(bonus_balance, _amount)`, `main = _amount - bonus`; fail with "Insufficient balance" if `main > balances.amount`. Deduct both, insert escrow with `amount`, `bonus_amount`, `main_amount`. Keep existing audit transaction.
- **`release_creation_fee_escrow(_escrow_id, _action)`**:
  - `refund`: credit `bonus_amount` back to `bonus_balance` and `main_amount` back to `amount`; log a single refund transaction.
  - `used`: unchanged ledger entry; platform_pool credit unchanged.
- **`finalize_market_creation_atomic`**: change bonus-coverage line to use only `_market_creation_fee_amount` instead of `_fee_amount`. Main deduction becomes `liquidity + (creation_fee - bonus_for_creation_fee) + auto_resolve_fee + boost + broadcast`. Return values keep `deducted_main` / `deducted_bonus`.
- When releasing a `held` escrow inside `finalize_market_creation_atomic`, skip the standalone bonus/main calculation for the creation fee (the escrow already split it) — keep the existing escrow branch behavior, just rely on the escrow row's `bonus_amount` / `main_amount` for auditing (no balance changes here).

### 2. Frontend (`src/pages/Create.tsx`)
- Update the fee-confirmation UI text to: "Paid from your bonus balance first ($X available), remainder from main balance."
- Keep `totalBalance` check (main + bonus) for the `handleFeeBypass` gate — already correct.
- For the verified-user-over-limit path (`exceededFreeLimit && feeBypass`), add a small note: "You've used all free markets; this market's $X fee will be paid from your bonus balance first, then main."
- No change to AI-generation, boost, broadcast, liquidity flows — they already charge main.

### 3. Memory
- Refresh `mem://constraints/bonus-balance-usage` to reflect that bonus covers **only**: prediction fees, market creation fee (escrow + non-escrow paths), AI generation. Never liquidity, boost, broadcast, auto-resolve, or wagers.

## Out of scope
- No new UI screens; no admin tooling changes (`AdminEscrows` keeps working — it just shows the same `amount`).
- No changes to the AI generation cost flow, withdrawal blocker, or referral bonus logic.

## Verification
- Read updated SQL functions back; confirm bonus is only applied to creation fee.
- Manually walk through 4 cases mentally: (a) non-verified with enough bonus → escrow fully from bonus; (b) non-verified with partial bonus → split; (c) verified over-limit with bonus → finalize splits; (d) verified under-limit → no fee charged.