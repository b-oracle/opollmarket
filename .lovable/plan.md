

## Feature Toggle System — Plan

### Overview
Create a centralized feature toggle system that lets Super Admins turn platform features on/off from Admin Settings. Disabled features are hidden from public users but remain accessible to Super Admin and Admin roles.

### Database Change
Add a new `feature_toggles` table:

```sql
CREATE TABLE public.feature_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for client-side gating)
CREATE POLICY "Anyone can read feature toggles"
  ON public.feature_toggles FOR SELECT USING (true);

-- Only super admins can modify
CREATE POLICY "Super admins can manage feature toggles"
  ON public.feature_toggles FOR ALL
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));
```

Seed with initial feature rows:

| feature_key | label |
|---|---|
| `feed` | Live Feed |
| `quick_trade` | Quick Trade |
| `create_market` | Create Market |
| `portfolio` | Portfolio |
| `rankings` | Leaderboard |
| `referrals` | Referrals |
| `social_profiles` | Social Profiles |
| `faq` | FAQ |

### New Hook: `useFeatureToggles`
- Fetches all rows from `feature_toggles` via react-query (cached, stale time ~30s)
- Exposes `isFeatureEnabled(key: string): boolean`
- If user has admin/super_admin role → always returns `true` (bypass)
- If feature is disabled and user is public → returns `false`

### UI Gating (3 locations)
1. **`src/components/BottomNav.tsx`** — Filter `baseNavItems` through `isFeatureEnabled`
2. **`src/components/DesktopSidebar.tsx`** — Filter `navItems` through `isFeatureEnabled`
3. **`src/App.tsx` Routes** — Wrap toggled routes with a guard component that redirects to `/` (or shows "Feature unavailable") when disabled for public users

Each nav item and route will be mapped to a `feature_key` (e.g., `/quick-trade` → `quick_trade`, `/feed` → `feed`).

### Admin Settings UI
Add a new "Feature Toggles" card in `AdminSettings.tsx` (super_admin only):
- List of features with Switch toggles
- Each toggle updates the `feature_toggles` table directly
- Shows feature label + enabled/disabled badge
- Saves are instant (per-toggle, no bulk save needed)
- Audit logged via `logAuditEvent`

### Files to Create/Edit
- **New migration** — Create `feature_toggles` table + seed data
- **New file** `src/hooks/useFeatureToggles.ts` — Hook with caching and admin bypass
- **Edit** `src/pages/admin/AdminSettings.tsx` — Add Feature Toggles card
- **Edit** `src/components/BottomNav.tsx` — Filter nav items
- **Edit** `src/components/DesktopSidebar.tsx` — Filter nav items
- **Edit** `src/App.tsx` — Add route guard component for toggled features

### Security
- Public users can only read toggles (SELECT)
- Only super_admin can INSERT/UPDATE/DELETE
- Admin and super_admin roles bypass all feature gates on the client side

