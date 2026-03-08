

# Plan: Auto-Import Polymarket Markets with Admin Presets

## Overview
Build a system that lets admins configure "import presets" (e.g., "Politics markets resolving within 2 weeks") and an edge function that fetches matching markets from Polymarket's public Gamma API, creates them locally on behalf of the super admin, and later auto-resolves them based on Polymarket's final resolution.

## Architecture

```text
┌─────────────────────┐
│  Admin Settings UI   │  Configure presets (category, max end date, poll interval)
└─────────┬───────────┘
          │ saved to DB
┌─────────▼───────────┐
│ polymarket_presets   │  New table storing import rules
└─────────┬───────────┘
          │ triggered by cron
┌─────────▼───────────┐
│ import-polymarkets   │  Edge function: fetches Gamma API, creates markets,
│   (edge function)    │  stores polymarket_id for resolution tracking
└─────────┬───────────┘
          │
┌─────────▼───────────┐
│ check-poly-resolve   │  Edge function (cron): polls Polymarket for resolved
│   (edge function)    │  markets, triggers local resolution + payouts
└─────────────────────┘
```

## Database Changes

**1. `polymarket_presets` table** — stores admin-configured import rules:
- `id`, `category` (text, e.g. "Politics"), `max_days_ahead` (int, e.g. 14), `enabled` (bool), `auto_approve` (bool), `created_by` (uuid), `created_at`, `updated_at`
- RLS: super_admin read/write, admin read

**2. Add columns to `markets` table:**
- `polymarket_id` (text, nullable) — the Polymarket condition_id or slug for tracking resolution
- `polymarket_event_slug` (text, nullable) — event slug for linking back

## Edge Functions

**1. `import-polymarkets/index.ts`** (cron every 30 min)
- Fetches active presets from `polymarket_presets`
- For each preset, calls `https://gamma-api.polymarket.com/events?tag={category}&active=true&closed=false&limit=20`
- Filters by end date within `max_days_ahead`
- Skips markets already imported (checks `polymarket_id` uniqueness)
- Creates binary markets on behalf of the super admin (fetched from `user_roles`) with:
  - Title, description, image from Polymarket
  - `status: 'active'` (if `auto_approve`) or `'pending'`
  - `polymarket_id` set for resolution tracking
  - `resolution_source: 'Polymarket'`
- No API key needed — Polymarket Gamma API is fully public

**2. `check-poly-resolve/index.ts`** (cron every 5 min)
- Queries local markets where `polymarket_id IS NOT NULL AND status = 'active'`
- For each, fetches `https://gamma-api.polymarket.com/markets/{polymarket_id}`
- If Polymarket market is resolved (`closed = true`, `resolutionSource` available):
  - Determines winning side from Polymarket's outcome prices (price=1 = winner)
  - Calls the existing resolve-market payout logic (inline, reusing the same balance-credit + transaction-insert pattern from `resolve-market`)
  - Sends notifications to participants

## Admin UI Changes

**New section in Admin Settings** (or a dedicated "Polymarket Import" tab):
- List of presets with toggle to enable/disable
- "Add Preset" form: select category, max resolution window (days), auto-approve toggle
- Display count of imported markets per preset
- Manual "Import Now" button per preset

**Admin Markets page**: add a "Polymarket" badge/icon on imported markets so admins can distinguish them.

## Cron Setup

Two `pg_cron` jobs:
1. `import-polymarkets` — every 30 minutes
2. `check-poly-resolve` — every 5 minutes

## Technical Notes

- Polymarket Gamma API is public, no auth needed — no secrets required
- Category mapping: Polymarket uses tags like `politics`, `crypto`, `sports` — we'll map these to our categories
- The import function will use the first super_admin user from `user_roles` as the `creator_wallet`
- Deduplication via `polymarket_id` unique constraint prevents double-imports
- Multi-outcome Polymarket events will import each sub-market as a separate binary market

