

# Clarifying the Fee Flow — Code vs Your Intent

## Current Code Analysis

After reviewing the `place-bet` edge function, **the code already does exactly what you described**:

1. **$100 wager** → 10% fee = **$10 goes to admin pool reserve** (line 186: full `totalFees` credited to admin)
2. **$90 (netAmount)** → goes into market liquidity pool (line 254: `poolAmount = netAmount`, line 297: added to market `liquidity`)
3. **After 48 hours** → `process-pending-commissions` deducts creator/referrer/bc400 splits FROM the admin pool reserve and credits recipients
4. **Shares** are calculated on the $90 net amount (line 139: `actualShares = netAmount / (price / 100)`)

## What's Confusing (UI Issue)

The admin settings UI has a **"Pool Reserve Split (%)"** field that implies the admin's take is a configurable split of the fee. But in reality, `adminAmount` is calculated (line 132) and **never used anywhere** — the admin keeps whatever remains after creator/referrer/bc400 are paid out.

So the "Pool Reserve Split" field is **cosmetic/misleading**. The admin's actual earnings = `totalFees - creatorAmount - referrerAmount - bc400Amount`.

## Proposed Changes

### 1. Remove the "Pool Reserve Split" field from Admin Settings
Since the admin keeps the remainder, there's no need for a separate configurable percentage. Instead, show it as a **calculated value**: `100% - creator% - referrer% - bc400% = admin's net take`.

### 2. Update Fee Summary to clearly show the two-stage flow

```text
STAGE 1 — At Trade Time
├── $100 wager
├── $10 (10%) → Admin Pool Reserve (held)
└── $90 (90%) → Market Liquidity Pool

STAGE 2 — After 48 Hours (from the $10 reserve)
├── Creator:  30% of $10 = $3.00
├── Referrer:  0% of $10 = $0.00
├── BC400:     0% of $10 = $0.00
└── Platform keeps: 70% = $7.00 (remainder)
```

### 3. Clean up `place-bet/index.ts`
- Remove the unused `adminAmount` variable and `adminSplit` calculation since they serve no purpose
- Remove `admin_fee_percent` from the fetched commission fields

### 4. Update `AdminSettings.tsx`
- Remove the "Pool Reserve Split (%)" input field
- Show "Platform Net Take" as a read-only calculated remainder in the Fee Summary
- Add a clear two-stage visual breakdown

### 5. Optionally remove `admin_fee_percent` from `commission_settings` table
- Or just leave it unused — no migration needed if we just stop reading it

## Files to modify
- `src/pages/admin/AdminSettings.tsx` — remove Pool Reserve Split input, update Fee Summary
- `supabase/functions/place-bet/index.ts` — remove unused `adminSplit`/`adminAmount` vars
- `src/hooks/useCommissionSettings.ts` — remove `admin_fee_percent` from interface (optional cleanup)

