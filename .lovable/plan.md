

# Add Admin-Configurable Boost & Broadcast Prices

## Problem
Boost tier prices ($20/$50/$150) and broadcast price ($5) are hardcoded in:
- `src/components/BoostMarketModal.tsx`
- `src/pages/Create.tsx`
- `supabase/functions/pay-promotion-balance/index.ts`
- `supabase/functions/create-boost-payment/index.ts`
- `supabase/functions/create-broadcast-payment/index.ts`
- `supabase/functions/create-promotion-payaza/index.ts`

No admin can change them without a code deploy.

## Solution

### 1. Database: Add columns to `commission_settings`
Add 4 new columns:
- `boost_flash_price` (numeric, default 20)
- `boost_standard_price` (numeric, default 50)
- `boost_whale_price` (numeric, default 150)
- `broadcast_price` (numeric, default 5)

### 2. Admin Settings UI (`AdminSettings.tsx`)
Add a new "Promotion Pricing" card with 4 input fields for the prices, following the existing pattern of other numeric settings on that page.

### 3. Frontend: Read prices from `commission_settings`
- **`useCommissionSettings.ts`**: Add the 4 new fields to the hook's interface and query.
- **`BoostMarketModal.tsx`**: Replace hardcoded `BOOST_TIERS` prices and `BROADCAST_PRICE` with values from the hook.
- **`Create.tsx`**: Replace hardcoded `BOOST_TIER_PRICES` and `BROADCAST_PRICE` with values from the hook.

### 4. Edge Functions: Read prices from DB instead of constants
Update these functions to query `commission_settings` for prices instead of using hardcoded values:
- `pay-promotion-balance/index.ts`
- `create-boost-payment/index.ts`
- `create-broadcast-payment/index.ts`
- `create-promotion-payaza/index.ts`

Each function already creates an `adminClient` — just add a single query at the top to fetch the pricing row.

### Files to modify
- **Database migration**: Add 4 columns to `commission_settings`
- `src/hooks/useCommissionSettings.ts` — add fields
- `src/pages/admin/AdminSettings.tsx` — add pricing card
- `src/components/BoostMarketModal.tsx` — use dynamic prices
- `src/pages/Create.tsx` — use dynamic prices
- `supabase/functions/pay-promotion-balance/index.ts` — read from DB
- `supabase/functions/create-boost-payment/index.ts` — read from DB
- `supabase/functions/create-broadcast-payment/index.ts` — read from DB
- `supabase/functions/create-promotion-payaza/index.ts` — read from DB

