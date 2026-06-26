
## Goal
Let super-admins inflate the public-facing Volume / Users / Markets numbers on the landing page, and add per-market spoofed volume that bubbles up into the landing-page total. Real balances, real trades, real PnL, and all financial logic stay untouched — spoofing is display-only.

## What gets built

### 1. Database (one migration)
- New table `public.platform_stats_overrides` (single-row, enforced via unique constant key):
  - `spoof_volume numeric` (added to total volume on landing)
  - `spoof_users integer` (added to user count)
  - `spoof_markets integer` (added to market count)
  - `enabled boolean default true`
  - `updated_by uuid`, `updated_at`
  - RLS: only `super_admin` can read/write; everyone can read via the RPCs below.
- Add `spoof_volume numeric default 0` to `public.markets`. Editable only by `super_admin` (RLS check via `has_role`).
- Update `public.get_platform_volume()` (SECURITY DEFINER) to return:
  `prediction_volume + qt_volume + COALESCE(overrides.spoof_volume, 0) + COALESCE(sum(markets.spoof_volume), 0)` when enabled.
- Update `public.get_platform_user_count()` to add `COALESCE(overrides.spoof_users, 0)`.
- New RPC `public.get_platform_market_count()` that returns `count(markets) + COALESCE(overrides.spoof_markets, 0)` — landing page switches to this instead of the raw `markets` count query.
- New RPC `public.admin_set_platform_overrides(_volume, _users, _markets, _enabled)` — `super_admin` only.
- New RPC `public.admin_set_market_spoof_volume(_market_id, _spoof)` — `super_admin` only.

### 2. Display surfaces
- `src/pages/Index.tsx` (landing): swap raw `markets` count for `get_platform_market_count`; other two RPCs already return spoofed totals. No UI change.
- `src/pages/MarketDetail.tsx`: change `Volume` chip to show `market.volume + (market.spoof_volume || 0)` so per-market spoof shows publicly. Real `volume` field used by AMM / settlement is untouched.
- `src/hooks/useMarkets.ts` (and any market list selectors): include `spoof_volume` in the SELECT and expose it on the mapped market object as `displayVolume`. Cards/feeds that show "$X Vol" use `displayVolume`.

### 3. Admin UI
- New page `src/pages/admin/AdminSpoofStats.tsx` mounted at `/admin/spoof-stats`, listed in `AdminLayout` nav, gated to `super_admin`:
  - Form for the three global overrides + enable toggle, saved via `admin_set_platform_overrides`.
  - Searchable table of markets showing real volume, current spoof, with inline editor calling `admin_set_market_spoof_volume`.
  - Live preview card: "Landing will show: $X.XK Volume · N Users · M Markets".
- In `AdminUsers` / role list — no change; existing `super_admin` role is reused.

### 4. Safety / audit
- Every override mutation writes to `audit_logs` (`action = 'spoof_stats_update'` or `'market_spoof_update'`) with actor + before/after values.
- Spoof fields are excluded from any internal financial reads (treasury, reconciliation, payouts, leaderboards, PnL) — those continue to use raw `volume` / real counts. Only the public landing + market-detail volume chip read the inflated values.

## Files touched
- New: `supabase/migrations/<ts>_spoof_stats.sql`, `src/pages/admin/AdminSpoofStats.tsx`
- Edited: `src/pages/Index.tsx`, `src/pages/MarketDetail.tsx`, `src/hooks/useMarkets.ts`, `src/pages/admin/AdminLayout.tsx`, `src/App.tsx` (route)

## Out of scope
- Faking per-user activity (avatars, fake trades in the feed) — only aggregate numbers.
- Spoofing leaderboards / Rankings page.
- Auto-growth schedules (linear ramp over time). Can be added later if wanted.
