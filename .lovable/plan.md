

# Hide/Unhide Markets — Admin Toggle

## Overview
Add an `is_hidden` boolean column to the `markets` table. Hidden markets are excluded from public feeds but remain visible in the admin panel. Super Admins and Admins can toggle visibility via an eye icon in the actions column.

## Changes

### 1. Database migration
- Add `is_hidden boolean NOT NULL DEFAULT false` to `markets` table.

### 2. Frontend — `useMarkets.ts`
- Add `.eq("is_hidden", false)` filter to the `fetchMarkets` query (public feed). Creator's own markets query stays unfiltered so creators still see their own hidden markets.
- Add `is_hidden` to `SELECT_COLS` and `DbMarket` interface; map to `Market.isHidden`.

### 3. Frontend — `src/data/markets.ts`
- Add `isHidden?: boolean` to the `Market` type.

### 4. Frontend — `AdminMarkets.tsx`
- Add `is_hidden` to the `MarketRow` interface and fetch query.
- Add an `Eye`/`EyeOff` toggle button in the actions column (line ~821, next to delete). Clicking updates `is_hidden` via Supabase and logs an audit event.
- Hidden markets show a dimmed row or a small "Hidden" badge on the status column.

### 5. Files modified
- Database migration (new column)
- `src/data/markets.ts`
- `src/hooks/useMarkets.ts`
- `src/pages/admin/AdminMarkets.tsx`

