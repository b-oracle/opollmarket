

## Plan: Auto-Resolve Platform Fee

### Overview
Add a configurable "Auto-Resolve Fee" that is charged to market creators when they enable auto-resolve during market creation. This fee goes to the platform (admin) as revenue.

### Changes

#### 1. Database: Add `auto_resolve_fee` column to `commission_settings`
- Migration: `ALTER TABLE commission_settings ADD COLUMN auto_resolve_fee numeric NOT NULL DEFAULT 0;`
- Default 0 means disabled until admin sets it.

#### 2. Admin Settings (`src/pages/admin/AdminSettings.tsx`)
- Add an "Auto-Resolve Fee ($)" input field in the appropriate settings card (near Market Creation Fee).
- Load and save the new `auto_resolve_fee` value alongside existing settings.

#### 3. Create Page (`src/pages/Create.tsx`)
- Fetch `auto_resolve_fee` from `commission_settings` (already loaded).
- When `autoResolve` is enabled, add `auto_resolve_fee` to the total deduction amount passed to `deduct_market_liquidity`.
- Update the Cost Breakdown UI to show "Auto-Resolve Fee" as a line item when auto-resolve is toggled on.
- Update the balance shortfall calculation to include the auto-resolve fee.
- Record a separate `transactions` entry for the auto-resolve fee (type: `auto_resolve_fee`, credited to admin).

#### 4. `deduct_market_liquidity` RPC — No change needed
- The fee is already passed via `_fee_amount` parameter. We simply add the auto-resolve fee to the existing fee amount in the client code.

#### 5. Commission Settings Hook (`src/hooks/useCommissionSettings.ts`)
- Add `auto_resolve_fee` to the interface and query select.

### Files Changed
| File | Change |
|------|--------|
| Migration SQL | Add `auto_resolve_fee` column |
| `src/hooks/useCommissionSettings.ts` | Add `auto_resolve_fee` field |
| `src/pages/Create.tsx` | Include auto-resolve fee in checkout total + UI breakdown |
| `src/pages/admin/AdminSettings.tsx` | Add admin input for auto-resolve fee |

