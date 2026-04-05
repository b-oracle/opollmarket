

## Add Admin Escrow Management UI

### Overview
Create a new admin page where super admins can view all creation fee escrows and release them (refund to user or mark as used). This eliminates the need for manual database intervention.

### Database
No migration needed — the `creation_fee_escrows` table and `release_creation_fee_escrow` RPC already exist with `refunded` and `used` actions.

### Changes

**1. New file: `src/pages/admin/AdminEscrows.tsx`**
- Fetch all rows from `creation_fee_escrows` joined with `profiles` (display_name, email) via user_id
- Display a table with columns: User, Amount, Status, Created, Released At
- For rows with `status = 'held'`, show two action buttons:
  - **Refund** — calls `release_creation_fee_escrow(id, 'refunded')`, credits user balance
  - **Mark Used** — calls `release_creation_fee_escrow(id, 'used')`, credits platform pool
- Confirmation dialog before each action
- Filter tabs: All / Held / Refunded / Used
- Fire audit log entry on each action

**2. `src/pages/admin/AdminLayout.tsx`**
- Add nav item: `{ to: "/admin/escrows", label: "Escrows", icon: Lock, roles: ["super_admin"] }`

**3. `src/App.tsx`**
- Add lazy import for `AdminEscrows`
- Add route `<Route path="escrows" element={<AdminEscrows />} />` inside AdminLayout

### Files Changed
| File | Change |
|------|--------|
| `src/pages/admin/AdminEscrows.tsx` | New — escrow list with refund/use actions |
| `src/pages/admin/AdminLayout.tsx` | Add Escrows nav item |
| `src/App.tsx` | Add lazy import + route |

