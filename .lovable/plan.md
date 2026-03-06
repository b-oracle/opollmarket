

# Auto-Resolving Crypto Price Prediction Markets

## Overview

When a user selects "Crypto" as the category during market creation, a new option appears letting them create an **auto-resolving price market**. They configure a crypto asset (e.g. BTC), a target price, a comparison operator (above/below/at-or-above), and a resolution deadline with time (UTC). A scheduled backend function periodically checks live prices and automatically resolves the market + distributes payouts when conditions are met or the deadline passes.

## Database Changes

Add columns to the `markets` table via migration:

```sql
ALTER TABLE public.markets
  ADD COLUMN auto_resolve BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN auto_resolve_asset TEXT,          -- e.g. 'BTC', 'ETH', 'BNB'
  ADD COLUMN auto_resolve_target_price NUMERIC,
  ADD COLUMN auto_resolve_operator TEXT,       -- 'above', 'below', 'at_or_above', 'at_or_below'
  ADD COLUMN auto_resolve_deadline TIMESTAMPTZ;
```

## New Edge Function: `check-auto-resolve`

A scheduled edge function (invoked via pg_cron every 5 minutes) that:

1. Queries all active markets where `auto_resolve = true`
2. For each, fetches the current price from CoinGecko's free API (no key needed) for the configured asset
3. Checks if the condition is met (e.g. BTC price >= $10,000)
4. If met: calls the existing `resolve-market` logic (extracted into a shared helper or invoked directly via service role) with `winning_side = 'yes'`
5. If deadline has passed without condition being met: resolves with `winning_side = 'no'`
6. Stores the resolved price in a transaction note for transparency

Since the `resolve-market` function currently requires admin auth, the new function will use the service role key directly and replicate the resolution + payout logic internally.

### Supported Assets (initial)
BTC, ETH, BNB, SOL, XRP, ADA, DOGE, MATIC — mapped to CoinGecko IDs.

## Cron Job (pg_cron)

```sql
SELECT cron.schedule(
  'check-auto-resolve-markets',
  '*/5 * * * *',
  $$SELECT extensions.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-auto-resolve',
    body := '{}'::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    )::jsonb
  );$$
);
```

## Frontend Changes

### User Market Creation (`Create.tsx`)
- When `category === "Crypto"`, show a toggle: "Enable Auto-Resolution by Price"
- When enabled, render:
  - **Asset selector** dropdown (BTC, ETH, BNB, SOL, etc.)
  - **Operator** dropdown (closes above / closes below / reaches or exceeds / drops to or below)
  - **Target price** input (numeric, USD)
  - **Resolution time** — the existing end date field gains a time picker for HH:MM UTC
- The market type is forced to `binary` (Yes/No — will the condition be met?)
- On submit, pass `auto_resolve: true` plus the config fields to the markets insert
- Auto-fill the resolution source as "Auto-resolved via live {ASSET}/USD price feed"

### Admin Market Creation (`AdminCreateMarket.tsx`)
- Same auto-resolve UI when Crypto category is selected

### Market Detail Page
- Show a badge/chip "Auto-Resolves" on crypto auto-resolve markets
- Display the condition: "Resolves YES if BTC ≥ $150,000 by Jun 30, 2026 12:00 UTC"

## Implementation Order

1. Database migration — add auto-resolve columns
2. Create `check-auto-resolve` edge function with CoinGecko price fetching + resolution logic
3. Add cron job migration to schedule the function every 5 minutes
4. Update `Create.tsx` — auto-resolve UI when Crypto category selected
5. Update `AdminCreateMarket.tsx` — same auto-resolve UI
6. Update market insert payloads in both forms
7. Update `MarketDetail` page to show auto-resolve badge and condition

