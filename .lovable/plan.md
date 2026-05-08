## Goal

Crypto Up/Down rounds are spawned automatically by the cron and currently get attributed to the super_admin user (BORACLE) via `creator_wallet` / `creator_name`. They show up in BORACLE's profile, creator dashboard, and any "created markets" view as if BORACLE created them. They should be treated as a system preset feature instead.

## Approach

Keep the DB columns populated (they're NOT NULL and used by RLS / payouts) but exclude `is_crypto_round = true` from every "this user created…" query in the UI, and relabel new spawns as "System" so any leakage no longer reads as BORACLE.

## Changes

### 1. Frontend — exclude crypto rounds from creator history

Add `.eq("is_crypto_round", false)` (or `.or("is_crypto_round.is.null,is_crypto_round.eq.false")`) to these queries that list a user's created markets:

- `src/pages/Profile.tsx` (line ~820) — own profile "Created" tab
- `src/pages/UserProfile.tsx` (line ~137) — public profile "Created" tab
- `src/pages/CreatorDashboard.tsx` (line ~149) — creator stats / list
- `src/pages/Portfolio.tsx` (line ~184) — created-markets section
- `src/components/admin/UserActivityDrawer.tsx` (lines ~160, ~279) — admin view of a user's created markets
- `src/pages/Create.tsx` draft / active counts (lines ~324, ~422, ~769) — only if they currently include the BORACLE account; verify and add the filter if so

Admin pages that intentionally show all markets (`AdminMarkets.tsx`) are left untouched.

### 2. Backend — relabel new crypto-round spawns

`supabase/functions/crypto-round-spawner/index.ts` (line ~197): change `creatorName` to a fixed `"System"` (instead of reading BORACLE's display_name) so future rows render as system-owned everywhere they do surface (e.g. market detail "Created by"). `creator_wallet` stays as the super_admin id for RLS/payout integrity.

### 3. Optional one-time backfill

Migration to update existing rows:
```sql
UPDATE public.markets
SET creator_name = 'System'
WHERE is_crypto_round = true;
```
This cleans up the "Created by BORACLE" label on already-spawned rounds without touching ownership.

## Out of scope

- No change to RLS, payouts, or the spawner's super_admin lookup.
- No change to admin dashboards that intentionally surface every market.
- No removal/deletion of crypto-round markets.

## Acceptance

- BORACLE's profile and creator dashboard show zero crypto Up/Down rounds.
- No other user's profile shows them either.
- Crypto round detail pages display "System" (not BORACLE) as the creator.
- Predictions, payouts, and the home feed for crypto rounds keep working unchanged.
