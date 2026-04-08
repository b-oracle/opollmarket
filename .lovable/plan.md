

## Plan: Business Role & Dashboard

### Overview
Add a new `business` role to the platform. Business users get their own `/business` dashboard (separate from admin) with analytics, API key management, and customization tools. Admins can assign the `business` role to any account.

### Database Changes

**1. Add `business` to `app_role` enum**
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'business';
```

**2. RLS policies for business users**
- Allow business users to read their own API keys from `api_keys` (currently admin-only)
- Allow business users to read their own analytics data (markets they created, transaction volume on their markets)

### Auth & Role System Updates

**3. Update `useAuth.ts`**
- Add `isBusiness` state, check via `has_role(_user_id, 'business')`
- Add `hasBusinessAccess` computed property
- Expose in context

### Routing & Layout

**4. Create `BusinessLayout` component** (`src/pages/business/BusinessLayout.tsx`)
- Similar structure to `AdminLayout` but with a trimmed sidebar: Dashboard, API Keys, Customization
- Auth gate: redirect to `/auth` if user lacks `business` role
- Own sidebar branding ("Business Portal")

**5. Create business pages:**
- `BusinessDashboard.tsx` — analytics cards showing: markets created, total volume on their markets, total participants, revenue/commissions earned
- `BusinessApiKeys.tsx` — reuse/adapt `AdminApiKeys` component scoped to the business user's own keys only
- `BusinessCustomization.tsx` — brand settings (name, logo, colors) tied to their API key

**6. Add routes in `App.tsx`**
```
/business          → BusinessLayout
  /business        → BusinessDashboard
  /business/api-keys → BusinessApiKeys
  /business/customize → BusinessCustomization
```

### Navigation

**7. Update `TopBar.tsx`**
- Show a "Business" badge/button for users with the `business` role (similar to Admin badge but navigates to `/business`)

**8. Update `BottomNav.tsx` / `DesktopSidebar.tsx`**
- Add a "Business" link for business-role users

### Admin: Assign Business Role

**9. Update `AdminUsers.tsx`**
- Add a "Business" role toggle/button in the user management row, allowing admins to assign/revoke the `business` role (insert/delete from `user_roles`)

### Files to Create
| File | Purpose |
|------|---------|
| `src/pages/business/BusinessLayout.tsx` | Layout with sidebar + auth gate |
| `src/pages/business/BusinessDashboard.tsx` | Analytics for business user's markets |
| `src/pages/business/BusinessApiKeys.tsx` | Self-service API key management |
| `src/pages/business/BusinessCustomization.tsx` | Brand settings |

### Files to Modify
| File | Change |
|------|--------|
| `src/hooks/useAuth.ts` | Add `isBusiness` / `hasBusinessAccess` |
| `src/App.tsx` | Add `/business` routes |
| `src/components/TopBar.tsx` | Business badge button |
| `src/components/DesktopSidebar.tsx` | Business nav link |
| `src/pages/admin/AdminUsers.tsx` | Role assignment UI |
| Migration SQL | Enum + RLS policies |

### Security
- Business users can only see/manage their own API keys and analytics — never other users' data
- Role assignment restricted to admin/super_admin via existing `user_roles` RLS
- API key creation by business users scoped to their `user_id`

